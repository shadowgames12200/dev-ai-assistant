/**
 * Ollama Integration Module
 * Permite usar modelos de IA rodando localmente via Ollama
 * Ideal para modo híbrido/local sem depender de APIs externas
 */

import { ENV } from "./env.js";

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

class OllamaClient {
  private baseUrl: string;
  private isAvailable: boolean = false;
  private checkedAvailability: boolean = false;

  constructor(baseUrl: string = "http://localhost:11434") {
    this.baseUrl = baseUrl;
  }

  /**
   * Verifica se o Ollama está disponível
   */
  async checkAvailability(): Promise<boolean> {
    if (this.checkedAvailability) return this.isAvailable;

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
        timeout: 5000,
      });
      this.isAvailable = response.ok;
      this.checkedAvailability = true;
      console.log(`[Ollama] Disponibilidade: ${this.isAvailable}`);
      return this.isAvailable;
    } catch (err) {
      console.warn("[Ollama] Não está disponível:", (err as Error).message);
      this.isAvailable = false;
      this.checkedAvailability = true;
      return false;
    }
  }

  /**
   * Lista os modelos disponíveis no Ollama
   */
  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) throw new Error("Falha ao listar modelos");
      const data = await response.json();
      return data.models || [];
    } catch (err) {
      console.error("[Ollama] Erro ao listar modelos:", err);
      return [];
    }
  }

  /**
   * Obtém o modelo padrão disponível (geralmente o primeiro)
   */
  async getDefaultModel(): Promise<string | null> {
    const models = await this.listModels();
    if (models.length === 0) {
      console.warn("[Ollama] Nenhum modelo disponível");
      return null;
    }
    // Preferir modelos menores e mais rápidos para chat
    const preferredModels = ["mistral", "neural-chat", "orca-mini", "llama2"];
    for (const pref of preferredModels) {
      const found = models.find(m => m.name.includes(pref));
      if (found) return found.name;
    }
    return models[0].name;
  }

  /**
   * Faz uma requisição de chat ao Ollama
   */
  async chat(
    messages: Array<{ role: string; content: string }>,
    options?: {
      model?: string;
      temperature?: number;
      top_p?: number;
      top_k?: number;
      num_predict?: number;
      stream?: boolean;
    }
  ): Promise<OllamaResponse | ReadableStream> {
    const model = options?.model || (await this.getDefaultModel());
    if (!model) {
      throw new Error("Nenhum modelo Ollama disponível");
    }

    const payload = {
      model,
      messages,
      stream: options?.stream ?? false,
      options: {
        temperature: options?.temperature ?? 0.7,
        top_p: options?.top_p ?? 0.9,
        top_k: options?.top_k ?? 40,
        num_predict: options?.num_predict ?? 512,
      },
    };

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    if (options?.stream) {
      return response.body as ReadableStream;
    }

    return await response.json();
  }

  /**
   * Faz uma requisição de geração de texto ao Ollama (legacy)
   */
  async generate(
    prompt: string,
    options?: {
      model?: string;
      temperature?: number;
      stream?: boolean;
    }
  ): Promise<any> {
    const model = options?.model || (await this.getDefaultModel());
    if (!model) {
      throw new Error("Nenhum modelo Ollama disponível");
    }

    const payload = {
      model,
      prompt,
      stream: options?.stream ?? false,
      options: {
        temperature: options?.temperature ?? 0.7,
      },
    };

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    if (options?.stream) {
      return response.body as ReadableStream;
    }

    return await response.json();
  }

  /**
   * Puxa um modelo do Ollama (download)
   */
  async pullModel(modelName: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelName }),
    });

    if (!response.ok) {
      throw new Error(`Falha ao baixar modelo: ${response.statusText}`);
    }

    // Ler o stream de progresso
    const reader = response.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        console.log(`[Ollama] Download: ${chunk.trim()}`);
      }
    }
  }
}

export const ollamaClient = new OllamaClient(
  process.env.OLLAMA_URL || "http://localhost:11434"
);

/**
 * Wrapper para usar Ollama como fallback quando APIs externas falham
 */
export async function invokeOllamaChat(
  messages: Array<{ role: string; content: string }>,
  options?: { model?: string; temperature?: number }
): Promise<string> {
  try {
    const isAvailable = await ollamaClient.checkAvailability();
    if (!isAvailable) {
      throw new Error("Ollama não está disponível");
    }

    const response = (await ollamaClient.chat(messages, {
      model: options?.model,
      temperature: options?.temperature,
      stream: false,
    })) as OllamaResponse;

    return response.message.content;
  } catch (err) {
    console.error("[Ollama] Erro:", err);
    throw err;
  }
}

/**
 * Wrapper para streaming com Ollama
 */
export async function invokeOllamaChatStream(
  messages: Array<{ role: string; content: string }>,
  options?: { model?: string; temperature?: number }
): Promise<ReadableStream> {
  const isAvailable = await ollamaClient.checkAvailability();
  if (!isAvailable) {
    throw new Error("Ollama não está disponível");
  }

  return (await ollamaClient.chat(messages, {
    model: options?.model,
    temperature: options?.temperature,
    stream: true,
  })) as ReadableStream;
}
