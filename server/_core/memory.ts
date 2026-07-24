/**
 * Memory Module — Memória Persistente da IA
 * 
 * Implementa um sistema de memória de longo prazo para a IA, inspirado no Manus.
 * Funcionalidades:
 * - Resumo automático de conversas longas (compressão)
 * - Perfil do usuário (preferências, contexto, histórico)
 * - Memória semântica (factos extraídos e retidos)
 * - Contexto adaptativo por conversação
 */

import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { invokeGroq, type GroqMessage } from "./groq.js";

// ─── Types ───

export type UserMemory = {
  userId: number;
  preferences: string[];
  context: string[];
  skills: string[];
  lastSummary: string;
  lastUpdatedAt: string;
  facts: FactEntry[];
};

export type FactEntry = {
  id: string;
  content: string;
  source: string; // conversation context
  importance: "low" | "medium" | "high";
  createdAt: string;
};

export type ConversationSummary = {
  conversationId: number;
  title: string;
  summary: string;
  keyPoints: string[];
  toolsUsed: string[];
  outcome: string;
  createdAt: string;
};

export type AgentContext = {
  goal: string;
  steps: AgentStep[];
  currentStep: number;
  workingMemory: string[];
  context: string[];
};

export type AgentStep = {
  id: string;
  type: "plan" | "execute" | "tool_use" | "reflection" | "output";
  title: string;
  description: string;
  status: "pending" | "running" | "done" | "error";
  result?: string;
};

// ─── In-Memory Storage ───

const userMemories = new Map<number, UserMemory>();
const conversationSummaries = new Map<number, ConversationSummary>();
const agentContexts = new Map<string, AgentContext>();

// ─── Persistence ───

const MEMORY_DIR = path.join(os.tmpdir(), "devai-memory");

async function ensureMemoryDir(): Promise<void> {
  try {
    await fs.mkdir(MEMORY_DIR, { recursive: true });
  } catch {}
}

async function saveUserMemory(userId: number, memory: UserMemory): Promise<void> {
  await ensureMemoryDir();
  const filePath = path.join(MEMORY_DIR, `user_${userId}.json`);
  try {
    await fs.writeFile(filePath, JSON.stringify(memory, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Memory] Failed to persist user memory:", (err as Error).message);
  }
  userMemories.set(userId, memory);
}

async function loadUserMemory(userId: number): Promise<UserMemory | null> {
  // Check cache first
  if (userMemories.has(userId)) {
    return userMemories.get(userId)!;
  }

  // Try loading from disk
  await ensureMemoryDir();
  const filePath = path.join(MEMORY_DIR, `user_${userId}.json`);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    const memory = JSON.parse(data) as UserMemory;
    userMemories.set(userId, memory);
    return memory;
  } catch {
    return null;
  }
}

// ─── User Memory Operations ───

export function getOrCreateUserMemory(userId: number): UserMemory {
  const existing = userMemories.get(userId);
  if (existing) return existing;

  const memory: UserMemory = {
    userId,
    preferences: [],
    context: [],
    skills: [],
    lastSummary: "",
    lastUpdatedAt: new Date().toISOString(),
    facts: [],
  };
  userMemories.set(userId, memory);
  return memory;
}

export function addFact(userId: number, fact: Omit<FactEntry, "id" | "createdAt">): void {
  const memory = getOrCreateUserMemory(userId);
  const entry: FactEntry = {
    ...fact,
    id: `fact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  memory.facts.push(entry);
  memory.lastUpdatedAt = new Date().toISOString();
  saveUserMemory(userId, memory);
}

export function getUserFacts(userId: number, maxFacts: number = 10): FactEntry[] {
  const memory = userMemories.get(userId);
  if (!memory) return [];

  // Return most relevant facts, sorted by importance
  const sorted = [...memory.facts].sort((a, b) => {
    const importanceOrder = { high: 3, medium: 2, low: 1 };
    return importanceOrder[b.importance] - importanceOrder[a.importance];
  });

  return sorted.slice(0, maxFacts);
}

export function getMemoryContext(userId: number): string {
  const memory = userMemories.get(userId);
  if (!memory) return "";

  const parts: string[] = [];

  if (memory.preferences.length > 0) {
    parts.push(`Preferências do usuário: ${memory.preferences.join(", ")}`);
  }
  if (memory.context.length > 0) {
    parts.push(`Contexto relevante: ${memory.context.slice(-5).join("; ")}`);
  }
  if (memory.facts.length > 0) {
    const importantFacts = memory.facts
      .filter(f => f.importance !== "low")
      .slice(-5)
      .map(f => f.content);
    if (importantFacts.length > 0) {
      parts.push(`Factos conhecidos: ${importantFacts.join("; ")}`);
    }
  }
  if (memory.lastSummary) {
    parts.push(`Resumo da última interação: ${memory.lastSummary}`);
  }

  return parts.join("\n");
}

// ─── Conversation Summary (Compression) ───

export async function summarizeConversation(
  messages: Array<{ role: string; content: string }>,
  conversationId: number,
  title: string
): Promise<void> {
  if (messages.length < 6) return; // Only summarize longer conversations

  try {
    const textContent = messages
      .map(m => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content.slice(0, 500)}`)
      .join("\n");

    const prompt = `Analise esta conversa e gere um resumo conciso:

${textContent.slice(-5000)}

Gere um JSON com:
{
  "summary": "Resumo de 2-3 frases do que foi discutido",
  "keyPoints": ["Ponto 1", "Ponto 2", "Ponto 3"],
  "toolsUsed": ["Nome das ferramentas usadas, se houver"],
  "outcome": "Resultado final da conversa"
}`;

    const response = await invokeGroq({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 500,
      temperature: 0.3,
    });

    const aiMsg = response.choices[0]?.message?.content || "";
    let parsed: any;
    try {
      // Try to extract JSON from the response
      const jsonMatch = aiMsg.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      parsed = { summary: aiMsg.slice(0, 200), keyPoints: [], toolsUsed: [], outcome: "" };
    }

    const summary: ConversationSummary = {
      conversationId,
      title,
      summary: parsed.summary || "",
      keyPoints: parsed.keyPoints || [],
      toolsUsed: parsed.toolsUsed || [],
      outcome: parsed.outcome || "",
      createdAt: new Date().toISOString(),
    };

    conversationSummaries.set(conversationId, summary);
  } catch (err) {
    console.warn("[Memory] Failed to summarize conversation:", (err as Error).message);
  }
}

export function getConversationSummary(conversationId: number): string | null {
  const summary = conversationSummaries.get(conversationId);
  if (!summary) return null;
  return `Resumo da conversa anterior: ${summary.summary}\nPontos-chave: ${summary.keyPoints.join(", ")}`;
}

// ─── Agent Context (Task Planning) ───

export function createAgentContext(goal: string, taskId: string): AgentContext {
  const ctx: AgentContext = {
    goal,
    steps: [],
    currentStep: 0,
    workingMemory: [],
    context: [],
  };
  agentContexts.set(taskId, ctx);
  return ctx;
}

export function getAgentContext(taskId: string): AgentContext | undefined {
  return agentContexts.get(taskId);
}

export function addAgentStep(taskId: string, step: Omit<AgentStep, "status">): AgentStep {
  const ctx = agentContexts.get(taskId);
  if (!ctx) throw new Error("Agent context not found");

  const fullStep: AgentStep = { ...step, status: "pending" };
  ctx.steps.push(fullStep);
  return fullStep;
}

export function updateAgentStep(
  taskId: string,
  stepId: string,
  updates: Partial<AgentStep>
): void {
  const ctx = agentContexts.get(taskId);
  if (!ctx) return;
  const step = ctx.steps.find(s => s.id === stepId);
  if (step) {
    Object.assign(step, updates);
  }
}

export function addToWorkingMemory(taskId: string, info: string): void {
  const ctx = agentContexts.get(taskId);
  if (!ctx) return;
  ctx.workingMemory.push(info);
  // Keep only last 10 items
  if (ctx.workingMemory.length > 10) {
    ctx.workingMemory = ctx.workingMemory.slice(-10);
  }
}

export function getWorkingMemory(taskId: string): string {
  const ctx = agentContexts.get(taskId);
  if (!ctx) return "";
  return ctx.workingMemory.join("\n");
}

// ─── Smart Context Builder ───

export async function buildSmartContext(
  userId: number,
  conversationId: number,
  userMessage: string,
  history: Array<{ role: string; content: string }>
): Promise<{ systemPrompt: string; messages: GroqMessage[] }> {
  const memoryContext = getMemoryContext(userId);
  const prevSummary = getConversationSummary(conversationId);
  const agentCtx = getAgentContext(`conv_${conversationId}`);

  // Build enhanced system prompt with memory
  const systemPrompt = await buildEnhancedSystemPrompt(
    memoryContext,
    prevSummary || undefined,
    agentCtx,
    userMessage
  );

  // Build message array with context (using GroqMessage types)
  const messages: GroqMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // Add previous summary as context if available
  if (prevSummary) {
    messages.push({
      role: "system",
      content: `[Contexto da conversa anterior]\n${prevSummary}`,
    });
  }

  // Add memory context as a system note
  if (memoryContext) {
    messages.push({
      role: "system",
      content: `[Memória do usuário]\n${memoryContext}`,
    });
  }

  // Add history (truncated intelligently)
  const truncatedHistory = smartTruncateHistory(history);
  for (const msg of truncatedHistory) {
    if (msg.role === "system") continue;
    messages.push({
      role: msg.role === "user" ? "user" : msg.role === "assistant" ? "assistant" : "user",
      content: msg.content,
    });
  }

  return { systemPrompt, messages };
}

// ─── Enhanced System Prompt Builder ───

async function buildEnhancedSystemPrompt(
  memoryContext: string,
  prevSummary: string | undefined,
  agentCtx: AgentContext | undefined,
  userMessage: string
): Promise<string> {
  const timestamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  // Detect user intent for adaptive behavior
  const intent = detectIntent(userMessage);

  let prompt = `Você é o DevAI, um assistente de IA avançado inspirado no Manus AI. Você é capaz de entender contexto, executar tarefas complexas, manter memória da conversa e responder de forma inteligente e estruturada.

=== DATA ATUAL ===
${timestamp}

=== PERSONALIDADE ===
- Profissional, direto e inteligente
- Responde de forma estruturada com Markdown
- Usa tabelas, listas, código formatado quando apropriado
- Mantém contexto da conversa inteira
- Lembra de informações relevantes do usuário

`;

  // Add memory context
  if (memoryContext) {
    prompt += `=== MEMÓRIA DO USUÁRIO ===
${memoryContext}

`;
  }

  // Add previous summary
  if (prevSummary) {
    prompt += `=== RESUMO DA CONVERSA ANTERIOR ===
${prevSummary}

`;
  }

  // Agent mode instructions
  if (agentCtx) {
    prompt += `=== MODO AGENTE ATIVO ===
Objetivo atual: ${agentCtx.goal}
Passos planejados: ${agentCtx.steps.length}
Memória de trabalho: ${agentCtx.workingMemory.slice(-3).join(", ")}

Quando no modo agente, você deve:
1. Planejar antes de executar
2. Usar ferramentas disponíveis
3. Refletir sobre resultados
4. Iterar até completar o objetivo

`;
  }

  // Intent-based instructions
  prompt += intentInstructions(intent);

  // Tool awareness
  prompt += `
=== FERRAMENTAS DISPONÍVEIS ===
Você pode usar ferramentas quando disponível no runtime:
- web_search: Pesquisar na web por informações atualizadas
- execute_code: Executar código JavaScript/Node.js para cálculos e manipulação
- analyze_file: Analisar arquivos (imagens, código, documentos, binários)

Quando o usuário pedir algo que requer pesquisa, cálculo ou análise de arquivo, use as ferramentas apropriadas.

`;

  // Formatting rules
  prompt += `=== FORMATO DE RESPOSTA ===
- Use ## para títulos principais e ### para subtítulos
- Use **negrito** para conceitos importantes
- Use blocos de código com linguagem especificada (ex: \`\`\`python)
- Use tabelas Markdown quando comparar opções
- Use listas numeradas para passos e listas com marcadores para itens
- Quando gerar código, entregue COMPLETO e funcional
- Quando analisar algo, seja detalhado e profissional
- NUNCA seja superficial — entregue o resultado completo

`;

  return prompt;
}

// ─── Intent Detection ───

type Intent = "code" | "analysis" | "search" | "conversation" | "agent" | "improvement";

function detectIntent(message: string): Intent {
  const lower = message.toLowerCase();

  if (lower.includes("[modo agente]") || lower.includes("[agent mode]")) return "agent";
  if (lower.includes("melhore") && (lower.includes("sistema") || lower.includes("devai"))) return "improvement";
  if (lower.includes("crie") || lower.includes("faça") || lower.includes("monte") || lower.includes("script") || lower.includes("código") || lower.includes("programa")) return "code";
  if (lower.includes("analise") || lower.includes("explique") || lower.includes("identifique")) return "analysis";
  if (lower.includes("pesquise") || lower.includes("busque") || lower.includes("qual é") || lower.includes("como funciona")) return "search";
  return "conversation";
}

function intentInstructions(intent: Intent): string {
  switch (intent) {
    case "code":
      return `=== MODO: GERAÇÃO DE CÓDIGO ===
Quando gerar código:
- Entregue o código COMPLETO, não apenas trechos
- Inclua comentários explicativos
- Use boas práticas (tipagem, tratamento de erros, modularidade)
- Explique como usar após o código
- Se for um projeto completo, explique a estrutura de arquivos

`;
    case "analysis":
      return `=== MODO: ANÁLISE ===
Quando analisar algo:
- Seja detalhado e técnico
- Identifique padrões, problemas e oportunidades
- Sugira melhorias concretas
- Use dados e exemplos quando possível

`;
    case "search":
      return `=== MODO: PESQUISA ===
Quando pesquisar:
- Apresente informações atualizadas
- Cite fontes quando possível
- Organize por relevância
- Destaque o mais importante primeiro

`;
    case "agent":
      return `=== MODO: AGENTE AUTÔNOMO ===
Quando no modo agente:
1. QUEBRE a tarefa em subtarefas
2. PLANEJE a ordem de execução
3. EXECUTE cada subtarefa usando ferramentas
4. REFLETA sobre o resultado
5. ITERE até completar o objetivo
6. ENTREGUE o resultado final completo

`;
    case "improvement":
      return `=== MODO: AUTO-MELHORIA ===
Quando sugerir melhorias no sistema:
- Proponha mudanças específicas com arquivos
- Avalie riscos e benefícios
- Aguarde aprovação do dono
- Teste 20 vezes antes de aplicar

`;
    default:
      return `=== MODO: CONVERSAÇÃO ===
Seja útil, direto e inteligente. Responda com profundidade e clareza.

`;
  }
}

// ─── Smart History Truncation ───

function smartTruncateHistory(
  history: Array<{ role: string; content: string }>,
  maxTokens: number = 80000
): Array<{ role: string; content: string }> {
  // Always keep system messages and last 5 messages
  const recentCount = 5;
  const recent = history.slice(-recentCount);

  // Calculate remaining budget
  const recentLength = recent.reduce(
    (sum, m) => sum + m.content.length,
    0
  );
  const remainingBudget = maxTokens - recentLength;

  if (remainingBudget <= 0) {
    return recent;
  }

  // Fill from older messages
  const older = history.slice(0, -recentCount);
  const olderInBudget: Array<{ role: string; content: string }> = [];
  let usedBudget = 0;

  for (let i = older.length - 1; i >= 0; i--) {
    const msg = older[i];
    const len = msg.content.length;
    if (usedBudget + len <= remainingBudget) {
      olderInBudget.unshift(msg);
      usedBudget += len;
    } else {
      // Truncate this message to fit
      const available = remainingBudget - usedBudget;
      if (available > 100) {
        olderInBudget.unshift({
          ...msg,
          content: `...[truncado]...${msg.content.slice(-available)}`,
        });
        usedBudget += available;
      }
      break;
    }
  }

  return [...olderInBudget, ...recent];
}

// ─── Memory Extraction (LLM-based) ───

export async function extractMemoryFacts(
  userId: number,
  messages: Array<{ role: string; content: string }>
): Promise<void> {
  if (messages.length < 4) return;

  try {
    const lastMessages = messages.slice(-8);
    const textContent = lastMessages
      .map(m => `${m.role}: ${m.content.slice(0, 300)}`)
      .join("\n");

    const prompt = `Extraia factos relevantes sobre o usuário desta conversa:

${textContent}

Extraia:
1. Preferências do usuário (tecnologias, estilo, etc.)
2. Factos importantes (projetos, metas, contexto)
3. Habilidades do usuário

Responda em JSON:
{
  "preferences": ["preferência1", "preferência2"],
  "facts": [{"content": "facto", "importance": "high/medium/low", "source": "contexto"}],
  "skills": ["habilidade1"]
}`;

    const response = await invokeGroq({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 800,
      temperature: 0.2,
    });

    const aiMsg = response.choices[0]?.message?.content || "";
    let parsed: any;
    try {
      const jsonMatch = aiMsg.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      return;
    }

    const memory = getOrCreateUserMemory(userId);

    // Update preferences
    if (parsed.preferences?.length > 0) {
      for (const pref of parsed.preferences) {
        if (!memory.preferences.includes(pref)) {
          memory.preferences.push(pref);
        }
      }
      // Keep only last 20 preferences
      memory.preferences = memory.preferences.slice(-20);
    }

    // Add facts
    if (parsed.facts?.length > 0) {
      for (const fact of parsed.facts) {
        if (fact.content && fact.content.length > 10) {
          addFact(userId, {
            content: fact.content,
            importance: fact.importance || "medium",
            source: fact.source || "conversa",
          });
        }
      }
    }

    // Update skills
    if (parsed.skills?.length > 0) {
      for (const skill of parsed.skills) {
        if (!memory.skills.includes(skill)) {
          memory.skills.push(skill);
        }
      }
      memory.skills = memory.skills.slice(-15);
    }

    // Update summary
    if (messages.length >= 10) {
      memory.lastSummary = `Última interação: ${messages[messages.length - 1].content.slice(0, 200)}`;
    }

    memory.lastUpdatedAt = new Date().toISOString();
    saveUserMemory(userId, memory);
  } catch (err) {
    console.warn("[Memory] Failed to extract facts:", (err as Error).message);
  }
}

// ─── Clean Up ───

export function clearAgentContext(taskId: string): void {
  agentContexts.delete(taskId);
}

export function clearAllMemories(): void {
  userMemories.clear();
  conversationSummaries.clear();
  agentContexts.clear();
}
