/**
 * Semantic Memory Module — Memória Semântica Inteligente com Supabase Vector
 * 
 * Melhorias implementadas:
 * 1. Deduplicação: Verifica se memória similar já existe antes de salvar
 * 2. Pruning (Poda): Remove memórias antigas/irrelevantes automaticamente
 * 3. Score de Relevância: Memórias ganham score baseado em frequência de acesso
 * 4. Batch Save: Salva múltiplas memórias de forma otimizada
 * 5. Cache de Embeddings: Evita gerar embeddings repetidos para o mesmo texto
 */

import { createClient } from "@supabase/supabase-js";
import { ENV } from "./env.js";

// ─── Config ───

const DUPLICATE_THRESHOLD = 0.92; // Acima disso, considera duplicata
const PRUNING_MAX_AGE_DAYS = 90; // Memórias mais antigas que isso são candidatas a remoção
const PRUNING_MIN_ACCESS_SCORE = 1; // Score mínimo para manter
const EMBEDDING_CACHE_MAX = 200; // Máximo de embeddings em cache (LRU)
const MEMORY_PER_USER_LIMIT = 100; // Limite máximo de memórias por usuário

// ─── Supabase Client ───

const supabase = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey);

// ─── Types ───

export type MemoryEntry = {
  id?: string;
  userId: number;
  content: string;
  metadata?: Record<string, any>;
  embedding?: number[];
  accessScore?: number;
};

export type SearchResult = {
  id: string;
  content: string;
  metadata: Record<string, any>;
  similarity: number;
  access_score?: number;
};

// ─── Embedding Cache (LRU) ───

const embeddingCache = new Map<string, number[]>();

function getCachedEmbedding(text: string): number[] | null {
  const key = text.replace(/\n/g, " ").toLowerCase().trim();
  return embeddingCache.get(key) || null;
}

function setCachedEmbedding(text: string, embedding: number[]): void {
  const key = text.replace(/\n/g, " ").toLowerCase().trim();
  if (embeddingCache.size >= EMBEDDING_CACHE_MAX) {
    // Remove o mais antigo (primeira chave inserida)
    const firstKey = embeddingCache.keys().next().value;
    if (firstKey !== undefined) {
      embeddingCache.delete(firstKey);
    }
  }
  embeddingCache.set(key, embedding);
}

// ─── Embedding Generation ───

/**
 * Gera um embedding para o texto usando a API do OpenAI (via proxy Forge se disponível).
 * Utiliza cache LRU para evitar chamadas repetidas.
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const cached = getCachedEmbedding(text);
  if (cached) return cached;

  const apiKey = ENV.forgeApiKey || process.env.OPENAI_API_KEY;
  const baseUrl = ENV.forgeApiUrl || "https://api.openai.com/v1";

  if (!apiKey) {
    throw new Error("API Key (Forge ou OpenAI) não configurada para gerar embeddings.");
  }

  const normalizedText = text.replace(/\n/g, " ");

  try {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: normalizedText,
        model: "text-embedding-3-small",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Erro ao gerar embedding: ${error}`);
    }

    const data = await response.json();
    const embedding = data.data[0].embedding;
    setCachedEmbedding(text, embedding);
    return embedding;
  } catch (err) {
    console.error("[SemanticMemory] Embedding error:", err);
    throw err;
  }
}

// ─── Deduplication ───

/**
 * Verifica se uma memória similar já existe. Se existir com similaridade alta,
 * atualiza o access_score da memória existente em vez de criar uma nova.
 */
async function checkDuplicate(
  userId: number,
  content: string
): Promise<{ isDuplicate: boolean; existingId?: string; existingScore?: number }> {
  try {
    const embedding = await generateEmbedding(content);
    const { data, error } = await supabase.rpc("match_memories", {
      query_embedding: embedding,
      match_threshold: DUPLICATE_THRESHOLD,
      match_count: 1,
      p_user_id: userId,
    });

    if (error) {
      console.warn("[SemanticMemory] Dedup check error:", error.message);
      return { isDuplicate: false };
    }

    if (data && data.length > 0) {
      const existing = data[0] as SearchResult;
      return {
        isDuplicate: true,
        existingId: existing.id,
        existingScore: existing.access_score ?? 1,
      };
    }

    return { isDuplicate: false };
  } catch {
    return { isDuplicate: false };
  }
}

/**
 * Incrementa o access_score de uma memória existente (quando acessada ou duplicada).
 */
async function incrementAccessScore(memoryId: string, currentScore: number = 1): Promise<void> {
  try {
    const newScore = currentScore + 1;
    await supabase
      .from("ai_memories")
      .update({
        metadata: {
          access_score: newScore,
          last_accessed: new Date().toISOString(),
        },
      })
      .eq("id", memoryId);
  } catch (err) {
    console.warn("[SemanticMemory] Failed to update access score:", (err as Error).message);
  }
}

// ─── Memory Operations ───

/**
 * Salva uma nova memória no Supabase com deduplicação e cache de embeddings.
 */
export async function saveMemory(entry: MemoryEntry): Promise<boolean> {
  try {
    const dupCheck = await checkDuplicate(entry.userId, entry.content);

    if (dupCheck.isDuplicate) {
      // Memória duplicada: incrementa o score da existente
      console.log(`[SemanticMemory] Dedup: Skipping duplicate, incrementing score of ${dupCheck.existingId}`);
      await incrementAccessScore(dupCheck.existingId!, dupCheck.existingScore);
      return true;
    }

    const embedding = await generateEmbedding(entry.content);
    const enrichedMetadata = {
      ...entry.metadata,
      access_score: entry.accessScore ?? 1,
      created_at: new Date().toISOString(),
      last_accessed: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("ai_memories")
      .insert({
        user_id: entry.userId,
        content: entry.content,
        metadata: enrichedMetadata,
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
 * Salva múltiplas memórias em batch (otimizado).
 */
export async function saveMemoriesBatch(entries: MemoryEntry[]): Promise<number> {
  let savedCount = 0;

  for (const entry of entries) {
    const result = await saveMemory(entry);
    if (result) savedCount++;
    // Pequeno delay para não sobrecarregar a API de embeddings
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`[SemanticMemory] Batch save: ${savedCount}/${entries.length} memories saved (dedup applied)`);
  return savedCount;
}

/**
 * Busca memórias similares a uma query, ordenadas por similaridade E access_score.
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
      match_count: limit * 3, // Busca mais para poder reordenar por access_score
      p_user_id: userId,
    });

    if (error) {
      console.error("[SemanticMemory] Search error:", error.message);
      return [];
    }

    const results = (data || []) as SearchResult[];

    // Reordenar: combinar similaridade + access_score
    const scored = results.map(r => {
      const accessScore = (r.metadata as any)?.access_score ?? 1;
      const lastAccessed = (r.metadata as any)?.last_accessed ?? r.metadata?.created_at ?? "";
      const recencyBoost = getRecencyBoost(lastAccessed);
      return {
        ...r,
        combinedScore: (r.similarity * 0.7) + (accessScore * 0.05) + recencyBoost,
      };
    });

    scored.sort((a, b) => b.combinedScore - a.combinedScore);

    // Incrementar access_score das memórias retornadas
    for (const result of scored.slice(0, limit)) {
      const currentScore = (result.metadata as any)?.access_score ?? 1;
      await incrementAccessScore(result.id, currentScore);
    }

    return scored.slice(0, limit);
  } catch (err) {
    console.error("[SemanticMemory] Search exception:", err);
    return [];
  }
}

/**
 * Calcula um boost baseado na recência da memória (memórias acessadas recentemente ganham mais).
 */
function getRecencyBoost(lastAccessed: string): number {
  if (!lastAccessed) return 0;
  const daysAgo = (Date.now() - new Date(lastAccessed).getTime()) / (1000 * 60 * 60 * 24);
  if (daysAgo <= 1) return 0.15;
  if (daysAgo <= 7) return 0.1;
  if (daysAgo <= 30) return 0.05;
  return 0;
}

/**
 * Constrói o contexto de memória para o prompt do sistema.
 */
export async function buildMemoryContext(userId: number, query: string): Promise<string> {
  const memories = await searchMemories(userId, query);

  if (memories.length === 0) return "";

  let context = "=== MEMÓRIAS RELEVANTES DO PASSADO ===\n";
  memories.forEach((m, i) => {
    const score = (m.metadata as any)?.access_score ?? 1;
    context += `[Memória ${i + 1}] (Relevância: ${(m.similarity * 100).toFixed(1)}%, Acessos: ${score})\n${m.content}\n\n`;
  });

  return context;
}

// ─── Pruning (Poda Automática) ───

/**
 * Remove memórias antigas e com baixo access_score para manter o banco limpo.
 * Deve ser chamado periodicamente (ex: uma vez por dia).
 */
export async function pruneOldMemories(userId: number, maxAgeDays: number = PRUNING_MAX_AGE_DAYS): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
    const cutoffStr = cutoffDate.toISOString();

    // Buscar memórias candidatas a remoção
    const { data: candidates, error } = await supabase
      .from("ai_memories")
      .select("id, metadata")
      .eq("user_id", userId)
      .lte("created_at", cutoffStr)
      .limit(50);

    if (error || !candidates) return 0;

    // Filtrar apenas as com access_score baixo
    const toDelete = candidates.filter(c => {
      const meta = c.metadata as any;
      const score = meta?.access_score ?? 0;
      const lastAccessed = meta?.last_accessed ?? meta?.created_at;
      const lastDays = lastAccessed
        ? (Date.now() - new Date(lastAccessed).getTime()) / (1000 * 60 * 60 * 24)
        : maxAgeDays;
      return score <= PRUNING_MIN_ACCESS_SCORE && lastDays > maxAgeDays;
    });

    if (toDelete.length === 0) return 0;

    const idsToDelete = toDelete.map(c => c.id);
    const { error: deleteError, count } = await supabase
      .from("ai_memories")
      .delete()
      .in("id", idsToDelete);

    if (deleteError) {
      console.error("[SemanticMemory] Prune error:", deleteError.message);
      return 0;
    }

    console.log(`[SemanticMemory] Pruned ${count ?? idsToDelete.length} old memories for user ${userId}`);
    return count ?? idsToDelete.length;
  } catch (err) {
    console.error("[SemanticMemory] Prune exception:", err);
    return 0;
  }
}

/**
 * Enforce limite máximo de memórias por usuário (remove as menos relevantes).
 */
export async function enforceMemoryLimit(userId: number, limit: number = MEMORY_PER_USER_LIMIT): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("ai_memories")
      .select("id, created_at, metadata")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(limit + 20); // Pega um pouco a mais para ter margem

    if (error || !data || data.length <= limit) return 0;

    // Ordenar por access_score e recência, manter as melhores
    const sorted = [...data].sort((a, b) => {
      const scoreA = (a.metadata as any)?.access_score ?? 0;
      const scoreB = (b.metadata as any)?.access_score ?? 0;
      return scoreB - scoreA;
    });

    const toDelete = sorted.slice(limit);
    const idsToDelete = toDelete.map(d => d.id);

    const { error: deleteError, count } = await supabase
      .from("ai_memories")
      .delete()
      .in("id", idsToDelete);

    if (deleteError) {
      console.error("[SemanticMemory] Limit enforcement error:", deleteError.message);
      return 0;
    }

    console.log(`[SemanticMemory] Enforced limit: removed ${count ?? 0} memories (kept ${limit})`);
    return count ?? 0;
  } catch (err) {
    console.error("[SemanticMemory] Limit enforcement exception:", err);
    return 0;
  }
}

// ─── Automatic Memory Extraction ───

/**
 * Analisa a conversa e extrai fatos importantes para salvar na memória semântica.
 * Agora usa deduplicação e batch save.
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
Se o fato já foi dito antes (mesma informação), NÃO o inclua na lista.

CONVERSA:
${text}

Responda apenas com uma lista de fatos curtos e diretos, um por linha. Se não houver nada importante ou tudo já foi registrado, responda "NADA".`;

    // Usar Groq para extrair os fatos (com fallback Gemini)
    let response: any;
    try {
      const { invokeGroq } = await import("./groq.js");
      response = await invokeGroq({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.1-8b-instant", // Modelo rápido para extração simples
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
      const extractedText = extractTextFromGeminiResponse(geminiResponse as any);
      response = {
        choices: [{ message: { content: extractedText } }],
      };
    }

    const result = response.choices[0]?.message?.content || "";
    if (result.includes("NADA")) return;

    const facts = result.split("\n").filter((f: string) => f.trim().length > 10);

    if (facts.length === 0) return;

    // Batch save com deduplicação automática
    const entries: MemoryEntry[] = facts.map((fact: string) => ({
      userId,
      content: fact.trim(),
      metadata: { source: "automatic_extraction", timestamp: new Date().toISOString() },
    }));

    const saved = await saveMemoriesBatch(entries);
    if (saved > 0) {
      console.log(`[SemanticMemory] Extracted and saved ${saved} new fact(s)`);
    }

    // Pruning: manter o banco limpo após inserção
    await pruneOldMemories(userId);
  } catch (err) {
    console.error("[SemanticMemory] Extraction error:", err);
  }
}
