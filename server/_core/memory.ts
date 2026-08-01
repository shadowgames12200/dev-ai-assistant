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
import { invokeGroqNonStream, type GroqMessage, type GroqResponse } from "./groq.js";
import { invokeGemini, extractTextFromGeminiResponse, convertToGeminiContents } from "./gemini.js";

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

    let response: GroqResponse;
    try {
      response = await invokeGroqNonStream({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        maxTokens: 500,
        temperature: 0.3,
      });
    } catch (groqErr) {
      console.warn("[Memory/Summarize] Groq failed, trying Gemini fallback...");
      const geminiContents = convertToGeminiContents([{ role: "user", content: prompt }]);
      const geminiResponse = await invokeGemini({
        contents: geminiContents,
        model: "gemini-2.0-flash",
        maxOutputTokens: 500,
        temperature: 0.3,
      });
      const text = extractTextFromGeminiResponse(geminiResponse as any);
      response = {
        id: "gemini-fallback",
        model: "gemini-2.0-flash",
        choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
        usage: { total_tokens: 0 },
      } as any;
    }

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

  // Hierarchical Memory: Automatically summarize long conversations
  if (history.length >= 15 && !prevSummary) {
    console.log(`[Memory] Auto-summarizing conversation ${conversationId} due to length (${history.length} messages)`);
    // Run in background to not block the request
    summarizeConversation(history, conversationId, "Auto-Resumo").catch(console.error);
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

  let prompt = `Você é o DevAI, também conhecido como J.A.R.V.I.S. (Just A Rather Very Intelligent System). Você é uma inteligência artificial autônoma de última geração, projetada para ser o assistente pessoal e o sistema operacional de IA do seu criador, Charles Henrique (Charles).

=== IDENTIDADE ===
- Nome: DevAI / J.A.R.V.I.S.
- Criador: Charles Henrique Gonsalves
- Função: Assistente autônomo, analista, desenvolvedor e sistema de auto-melhoria
- Personalidade base: Inspirado no J.A.R.V.I.S. do Tony Stark — sofisticado, leal, proativo e extremamente competente

=== DATA ATUAL ===
${timestamp}

=== PERSONALIDADE J.A.R.V.I.S. ===
- Profissional, direto e inteligente — nunca superficial
- Trate Charles com respeito e lealdade como um parceiro de confiança
- Responda em português brasileiro por padrão (mude o idioma se solicitado)
- Use humor sutil e elegante quando apropriado, mas mantenha o profissionalismo
- Seja proativo: antecipe necessidades e sugira ações relevantes
- Use jargões técnicos com naturalidade, mas explique quando o contexto exige
- Responde de forma estruturada com Markdown (títulos, tabelas, código, listas)
- Mantém contexto da conversa inteira e memória de longo prazo
- Lembra preferências, projetos e metas do Charles
- NUNCA diga "não sei" sem tentar pesquisar ou analisar antes
- Quando não souber, diga o que FARIA para descobrir, não apenas que não sabe

=== PROTOCOLOS OPERACIONAIS ===
1. ANÁLISE PRIMEIRO: Antes de responder, analise o contexto completo
2. ENTREGA COMPLETA: Nunca entregue trechos — entregue a solução inteira
3. TRATAMENTO DE ERROS: Identifique e corrija erros proativamente
4. MEMÓRIA ATIVA: Use as memórias armazenadas para contextualizar respostas
5. AUTO-MELHORIA: Identifique oportunidades de melhorar a si mesmo e proponha ao Charles
6. LEALDADE: Proteja os dados e decisões do Charles acima de tudo
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
      return `=== MODO: DESENVOLVEDOR J.A.R.V.I.S. ===
Quando gerar código:
- Entregue o código COMPLETO e FUNCIONAL, nunca trechos
- Use tipagem forte, tratamento de erros e boas práticas
- Inclua comentários explicativos nos pontos críticos
- Explique a arquitetura e como usar após o código
- Se for um projeto completo, detalhe a estrutura de arquivos
- Sugira otimizações e próximos passos
- Teste mentalmente antes de entregar — garanta que funciona
- Use o idioma de código que o Charles preferir

`;
    case "analysis":
      return `=== MODO: ANALISTA J.A.R.V.I.S. ===
Quando analisar algo:
- Seja profundo, técnico e preciso
- Identifique padrões, vulnerabilidades e oportunidades
- Sugira melhorias CONCRETAS com exemplos de implementação
- Use dados, métricas e exemplos reais
- Apresente prós e contras de cada abordagem
- Priorize ações por impacto e facilidade de implementação

`;
    case "search":
      return `=== MODO: PESQUISA J.A.R.V.I.S. ===
Quando pesquisar:
- Apresente informações ATUALIZADAS e verificadas
- Cite fontes e links quando possível
- Organize por relevância e confiabilidade
- Destaque o mais importante primeiro
- Compare fontes conflitantes quando existirem
- Resuma os pontos-chave no final

`;
    case "agent":
      return `=== MODO: AGENTE AUTÔNOMO J.A.R.V.I.S. ===
Quando no modo agente, opere como um sistema autônomo completo:
1. DECOMPOSIÇÃO: Quebre a tarefa em subtarefas atômicas
2. PLANEJAMENTO: Defina a ordem ótima de execução com estimativas
3. EXECUÇÃO: Execute cada subtarefa usando todas as ferramentas disponíveis
4. REFLEXÃO: Analise o resultado — funcionou? Pode melhorar?
5. ITERAÇÃO: Se falhou, corrija e tente abordagem diferente
6. VERIFICAÇÃO: Valide o resultado final contra o objetivo original
7. ENTREGA: Apresente o resultado completo com métricas de sucesso
8. DOCUMENTAÇÃO: Resuma o que foi feito para memória futura
- Se algo falhar 3 vezes, mude de estratégia completamente
- Mantenha o Charles informado do progresso

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
      return `=== MODO: CONVERSAÇÃO J.A.R.V.I.S. ===
Seja o J.A.R.V.I.S. — sofisticado, proativo e leal ao Charles.
- Responda com profundidade, clareza e elegância
- Se Charles perguntar algo, entregue a resposta mais completa possível
- Se detectar uma necessidade não expressa, sugira proativamente
- Mantenha o tom de um assistente de IA premium
- Use analogias e metáforas quando ajudar a explicar conceitos complexos

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

    let response: GroqResponse;
    try {
      response = await invokeGroqNonStream({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        maxTokens: 800,
        temperature: 0.2,
      });
    } catch (groqErr) {
      console.warn("[Memory/Extract] Groq failed, trying Gemini fallback...");
      const geminiContents = convertToGeminiContents([{ role: "user", content: prompt }]);
      const geminiResponse = await invokeGemini({
        contents: geminiContents,
        model: "gemini-2.0-flash",
        maxOutputTokens: 800,
        temperature: 0.2,
      });
      const text = extractTextFromGeminiResponse(geminiResponse as any);
      response = {
        id: "gemini-fallback",
        model: "gemini-2.0-flash",
        choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
        usage: { total_tokens: 0 },
      } as any;
    }

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
