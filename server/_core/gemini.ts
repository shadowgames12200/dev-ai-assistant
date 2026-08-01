import { ENV } from "./env.js";

// ─── Gemini Types ───

export type GeminiRole = "user" | "model";

export type GeminiContent = {
  role: GeminiRole;
  parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
};

export type GeminiGenerateParams = {
  contents: GeminiContent[];
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
};

export type GeminiResponse = {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
    finishReason: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
};

// ─── Gemini API Config ───

const GEMINI_API_URL = (model: string) => {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
};

// Exportar função para verificar se a API key está configurada
export function isGeminiConfigured(): boolean {
  return !!ENV.geminiApiKey;
}

const assertGeminiApiKey = () => {
  if (!ENV.geminiApiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. " +
      "Please add the GEMINI_API_KEY environment variable to your server settings. " +
      "Get your key at https://aistudio.google.com/apikey"
    );
  }
  // Verificar se a key parece válida (começa com AIza)
  if (!ENV.geminiApiKey.startsWith("AIza")) {
    throw new Error(
      "GEMINI_API_KEY is invalid. Keys must start with 'AIza'. " +
      "Get your key at https://aistudio.google.com/apikey"
    );
  }
};

// ─── Retry logic ───

const RETRY_MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 10_000;

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const computeBackoffDelay = (attempt: number): number => {
  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  const jittered = cap / 2 + Math.random() * (cap / 2);
  return Math.min(Math.max(jittered, 0), RETRY_MAX_DELAY_MS);
};

const fetchWithBackoff = async (url: string, init: RequestInit): Promise<Response> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || attempt === RETRY_MAX_RETRIES) {
        return response;
      }

      // Se for erro de autenticação (400/401), não fazer retry
      if (response.status === 400 || response.status === 401) {
        return response;
      }

      console.warn(`[Gemini] Request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`);
      try {
        await response.body?.cancel();
      } catch {}
      await sleep(computeBackoffDelay(attempt));
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_MAX_RETRIES) throw error;
      console.warn(`[Gemini] Request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`);
      await sleep(computeBackoffDelay(attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini request failed after exhausting retries");
};

// ─── Invoke Gemini ───

export type GeminiGenerateParamsWithStream = GeminiGenerateParams & { stream?: boolean };

export async function invokeGemini(params: GeminiGenerateParamsWithStream): Promise<GeminiResponse | ReadableStream> {
  assertGeminiApiKey();

  const { contents, maxOutputTokens, temperature = 0.7, stream = false } = params;
  const model = params.model ?? "gemini-2.0-flash";

  const payload: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxOutputTokens ?? 8192,
    },
  };

  if (params.systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: params.systemInstruction }],
    };
  }

  if (stream) {
    payload.generationConfig = {
      ...(payload.generationConfig as Record<string, unknown>),
      temperature,
    };
    payload.model = model;
  }

  console.log(`[Gemini] Calling model: ${model} (stream: ${stream})`);

  const url = `${GEMINI_API_URL(model)}?key=${ENV.geminiApiKey}${stream ? "&alt=sse" : ""}`;

  const response = await fetchWithBackoff(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMsg = `Gemini API error: ${response.status}`;

    if (response.status === 400) {
      errorMsg = `Gemini API bad request: ${errorText}`;
    } else if (response.status === 429) {
      errorMsg = "Gemini API rate limit exceeded. Please wait a moment and try again.";
    } else if (response.status >= 500) {
      errorMsg = `Gemini API server error (${response.status}). Please try again later.`;
    }

    throw new Error(errorMsg);
  }

  if (stream) {
    return response.body!;
  }

  return (await response.json()) as GeminiResponse;
}

// ─── Helper: Convert Groq-style messages to Gemini format ───

export function convertToGeminiContents(
  messages: Array<{ role: string; content: string }>,
  systemInstruction?: string
): GeminiContent[] {
  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      // Skip system messages, use systemInstruction instead
      continue;
    }

    const role = msg.role === "assistant" ? "model" : "user";

    // Check if content contains image data
    if (msg.content.startsWith("data:image/")) {
      const match = msg.content.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        contents.push({
          role,
          parts: [{ inlineData: { mimeType: match[1], data: match[2] } }],
        });
      } else {
        contents.push({ role, parts: [{ text: msg.content }] });
      }
    } else {
      contents.push({ role, parts: [{ text: msg.content }] });
    }
  }

  return contents;
}

// ─── Helper: Extract text from Gemini response ───

export function extractTextFromGeminiResponse(response: GeminiResponse): string {
  if (!response.candidates || response.candidates.length === 0) {
    throw new Error("Gemini returned no candidates");
  }

  const candidate = response.candidates[0];
  if (candidate.finishReason === "SAFETY") {
    throw new Error("Gemini blocked the response due to safety filters");
  }

  const parts = candidate.content?.parts ?? [];
  return parts.map(p => p.text ?? "").join("\n");
}

// ─── Fallback wrapper: Try Groq first, then Gemini ───

export async function invokeLLMWithFallback(
  messages: Array<{ role: string; content: string }>,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    tools?: any[];
  } = {}
): Promise<{ content: string; model: string }> {
  const { temperature = 0.7, maxTokens, systemPrompt } = options;

  // Try Groq first (faster)
  try {
    if (ENV.groqApiKey && ENV.groqApiKey.startsWith("gsk_")) {
      const { invokeGroq } = await import("./groq.js");
      const groqMessages = messages.map(m => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      }));

      if (systemPrompt) {
        groqMessages.unshift({ role: "system", content: systemPrompt });
      }

      const response = await invokeGroq({
        messages: groqMessages,
        model: options.model ?? "llama-3.3-70b-versatile",
        temperature,
        maxTokens,
      });

      if (response && "choices" in response) {
        const groqResponse = response as any;
        return {
          content: groqResponse.choices[0]?.message?.content ?? "",
          model: groqResponse.model ?? "groq-llama",
        };
      }
    }
  } catch (err) {
    console.warn("[LLM] Groq failed, falling back to Gemini:", (err as Error).message);
  }

  // Fallback to Gemini
  try {
    if (!ENV.geminiApiKey || !ENV.geminiApiKey.startsWith("AIza")) {
      throw new Error("GEMINI_API_KEY not configured or invalid");
    }

    const geminiContents = convertToGeminiContents(messages);

    const response = await invokeGemini({
      contents: geminiContents,
      model: "gemini-2.0-flash",
      temperature,
      maxOutputTokens: maxTokens,
      systemInstruction: systemPrompt,
    });

    if (response && "candidates" in response) {
      const text = extractTextFromGeminiResponse(response as GeminiResponse);
      return {
        content: text,
        model: "gemini-2.0-flash",
      };
    }
  } catch (err) {
    console.error("[LLM] Gemini also failed:", (err as Error).message);
    throw new Error(`Both Groq and Gemini failed. Groq: ${(err as Error).message}`);
  }

  throw new Error("No LLM provider available. Check GROQ_API_KEY or GEMINI_API_KEY environment variables.");
}
