/**
 * Semantic Memory Module — Memória Semântica com Supabase Vector
 * 
 * Implementa busca por similaridade para que a IA tenha memória de longo prazo.
 * Utiliza o Supabase como banco de dados vetorial.
 */

import { createClient } from "@supabase/supabase-js";
import { ENV } from "./env.js";

// ─── Supabase Client ───

const supabase = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey);

// ─── Types ───

export type MemoryEntry = {
  id?: string;
  userId: number;
  content: string;
  metadata?: Record<string, any>;
  embedding?: number[];
};

export type SearchResult = {
  id: string;
  content: string;
  metadata: Record<string, any>;
  similarity: number;
};

// ─── Embedding Generation ───

/**
 * Gera um embedding para o texto usando a API do OpenAI (via proxy Forge se disponível)
 * Nota: Como o Groq não suporta embeddings nativamente, usamos o Forge ou OpenAI.
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = ENV.forgeApiKey || process.env.OPENAI_API_KEY;
  const baseUrl = ENV.forgeApiUrl || "https://api.openai.com/v1";

  if (!apiKey) {
    throw new Error("API Key (Forge ou OpenAI) não configurada para gerar embeddings.");
  }

  try {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: text.replace(/\n/g, " "),
        model: "text-embedding-3-small",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Erro ao gerar embedding: ${error}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (err) {
    console.error("[SemanticMemory] Embedding error:", err);
    throw err;
  }
}

// ─── Memory Operations ───

/**
 * Salva uma nova memória no Supabase com seu embedding
 */
export async function saveMemory(entry: MemoryEntry): Promise<boolean> {
  try {
    const embedding = await generateEmbedding(entry.content);

    const { error } = await supabase
      .from("ai_memories")
      .insert({
        user_id: entry.userId,
        content: entry.content,
        metadata: entry.metadata || {},
        embedding: embedding,
      });

    if (error) {
      console.error("[SemanticMemory] Save error:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[SemanticMemory] Save exception:", err);
    return false;
  }
}

/**
 * Busca memórias similares a uma query
 */
export async function searchMemories(
  userId: number,
  query: string,
  limit: number = 5,
  threshold: number = 0.5
): Promise<SearchResult[]> {
  try {
    const queryEmbedding = await generateEmbedding(query);

    const { data, error } = await supabase.rpc("match_memories", {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
      p_user_id: userId,
    });

    if (error) {
      console.error("[SemanticMemory] Search error:", error.message);
      return [];
    }

    return (data || []) as SearchResult[];
  } catch (err) {
    console.error("[SemanticMemory] Search exception:", err);
    return [];
  }
}

/**
 * Constrói o contexto de memória para o prompt do sistema
 */
export async function buildMemoryContext(userId: number, query: string): Promise<string> {
  const memories = await searchMemories(userId, query);
  
  if (memories.length === 0) return "";

  let context = "=== MEMÓRIAS RELEVANTES DO PASSADO ===\n";
  memories.forEach((m, i) => {
    context += `[Memória ${i + 1}] (Similaridade: ${(m.similarity * 100).toFixed(1)}%)\n${m.content}\n\n`;
  });

  return context;
}

// ─── Automatic Memory Extraction ───

/**
 * Analisa a conversa e extrai fatos importantes para salvar na memória semântica
 */
export async function extractAndSaveSemanticMemories(
  userId: number,
  messages: Array<{ role: string; content: string }>
): Promise<void> {
  // Apenas extrair se houver mensagens suficientes
  if (messages.length < 4) return;

  try {
    const lastInteraction = messages.slice(-4);
    const text = lastInteraction.map(m => `${m.role}: ${m.content}`).join("\n");

    const prompt = `Analise a conversa abaixo e extraia apenas FATOS NOVOS E IMPORTANTES sobre o usuário ou seus projetos que devem ser lembrados para sempre. 
Ignore saudações ou conversas triviais.

CONVERSA:
${text}

Responda apenas com uma lista de fatos curtos e diretos, um por linha. Se não houver nada importante, responda "NADA".`;

    // Usar Groq para extrair os fatos (com fallback Gemini)
    let response: any;
    try {
      const { invokeGroq } = await import("./groq.js");
      response = await invokeGroq({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.3-70b-versatile",
        maxTokens: 500,
      });
    } catch (groqErr) {
      console.warn("[SemanticMemory] Groq failed, trying Gemini fallback...");
      const { invokeGemini, extractTextFromGeminiResponse, convertToGeminiContents } = await import("./gemini.js");
      const geminiContents = convertToGeminiContents([{ role: "user", content: prompt }]);
      const geminiResponse = await invokeGemini({
        contents: geminiContents,
        model: "gemini-2.0-flash",
        maxOutputTokens: 500,
      });
      const text = extractTextFromGeminiResponse(geminiResponse as any);
      response = {
        choices: [{ message: { content: text } }],
      };
    }

    const result = response.choices[0]?.message?.content || "";
    if (result.includes("NADA")) return;

    const facts = result.split("\n").filter(f => f.trim().length > 10);

    for (const fact of facts) {
      await saveMemory({
        userId,
        content: fact.trim(),
        metadata: { source: "automatic_extraction", timestamp: new Date().toISOString() }
      });
    }
  } catch (err) {
    console.error("[SemanticMemory] Extraction error:", err);
  }
}
