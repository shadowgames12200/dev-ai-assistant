import { ENV } from "./env.js";

// ─── Groq Types ───

export type GroqRole = "system" | "user" | "assistant";

export type GroqTextContent = {
  type: "text";
  text: string;
};

export type GroqImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type GroqContent = string | GroqTextContent | GroqImageContent;

export type GroqMessage = {
  role: GroqRole;
  content: GroqContent | GroqContent[];
};

export type GroqInvokeParams = {
  messages: GroqMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
};

export type GroqResponse = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

// ─── Groq API Config ───

const GROQ_API_URL = () => {
  const base = ENV.groqApiUrl?.replace(/\/$/, "");
  return `${base}/chat/completions`;
};

const assertGroqApiKey = () => {
  if (!ENV.groqApiKey) {
    throw new Error("GROQ_API_KEY is not configured. Please set the GROQ_API_KEY environment variable.");
  }
};

// ─── Retry logic ───

const RETRY_MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 30_000;

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

      console.warn(`[Groq] Request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`);
      try {
        await response.body?.cancel();
      } catch {}
      await sleep(computeBackoffDelay(attempt));
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_MAX_RETRIES) throw error;
      console.warn(`[Groq] Request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`);
      await sleep(computeBackoffDelay(attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Groq request failed after exhausting retries");
};

// ─── Invoke Groq ───

export async function invokeGroq(params: GroqInvokeParams): Promise<GroqResponse> {
  assertGroqApiKey();

  const { messages, maxTokens, temperature = 0.7 } = params;
  const model = params.model ?? "llama-3.3-70b-versatile";

  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature,
  };

  if (typeof maxTokens === "number") {
    payload.max_tokens = maxTokens;
  }

  const response = await fetchWithBackoff(GROQ_API_URL(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.groqApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Groq invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as GroqResponse;
}

// ─── Helper: Build user message with file content ───

/**
 * Builds a Groq-compatible message that includes both text and optionally an image.
 * For text files: content is passed as text directly.
 * For images: content is passed as image_url with base64 data URI.
 * For unsupported binary files: a text placeholder is sent.
 */
export function buildGroqUserMessage(
  text: string,
  base64Image?: string,
  imageType?: string
): GroqContent[] {
  const parts: GroqContent[] = [];

  if (text) {
    parts.push({ type: "text", text });
  }

  if (base64Image && imageType) {
    parts.push({
      type: "image_url",
      image_url: {
        url: `data:${imageType};base64,${base64Image}`,
        detail: "high",
      },
    });
  }

  return parts;
}
