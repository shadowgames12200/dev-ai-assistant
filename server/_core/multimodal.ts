/**
 * Multimodal Module — Visão e Geração de Imagens
 * 
 * Integra APIs para análise de imagens (Visão) e geração de novas imagens.
 */

import { ENV } from "./env.js";

// ─── Types ───

export type ImageGenerationParams = {
  prompt: string;
  size?: "256x256" | "512x512" | "1024x1024";
  quality?: "standard" | "hd";
  n?: number;
};

// ─── Image Generation (DALL-E 3) ───

/**
 * Gera uma imagem usando DALL-E 3 (via OpenAI/Forge)
 */
export async function generateImage(params: ImageGenerationParams): Promise<string[]> {
  const apiKey = ENV.forgeApiKey || process.env.OPENAI_API_KEY;
  const baseUrl = ENV.forgeApiUrl || "https://api.openai.com/v1";

  if (!apiKey) {
    throw new Error("API Key não configurada para geração de imagens.");
  }

  try {
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: params.prompt,
        n: params.n || 1,
        size: params.size || "1024x1024",
        quality: params.quality || "standard",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Erro na geração de imagem: ${error}`);
    }

    const data = await response.json();
    return data.data.map((img: any) => img.url);
  } catch (err) {
    console.error("[Multimodal] Generation error:", err);
    throw err;
  }
}

// ─── Vision (Análise de Imagem) ───

/**
 * Analisa uma imagem usando modelos de visão (GPT-4o ou Qwen-VL)
 */
export async function analyzeImage(
  base64Image: string,
  prompt: string = "Descreva esta imagem em detalhes."
): Promise<string> {
  const apiKey = ENV.forgeApiKey || process.env.OPENAI_API_KEY;
  const baseUrl = ENV.forgeApiUrl || "https://api.openai.com/v1";

  if (!apiKey) {
    throw new Error("API Key não configurada para análise de visão.");
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o", // Ou qwen-vl se disponível no proxy
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Erro na análise de visão: ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (err) {
    console.error("[Multimodal] Vision error:", err);
    throw err;
  }
}

// ─── Tool Integration ───

export const multimodalTools: any[] = [
  {
    type: "function",
    function: {
      name: "generate_image",
      description: "Gera uma imagem artística ou técnica baseada em uma descrição (DALL-E 3).",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Descrição detalhada da imagem a ser gerada." },
          quality: { type: "string", enum: ["standard", "hd"], description: "Qualidade da imagem." },
        },
        required: ["prompt"],
      },
    },
  },
];

export const multimodalHandlers: Record<string, (args: any) => Promise<string>> = {
  generate_image: async ({ prompt, quality }: { prompt: string; quality?: "standard" | "hd" }) => {
    try {
      const urls = await generateImage({ prompt, quality });
      return `Imagem gerada com sucesso! Você pode visualizá-la aqui:\n${urls.map(url => `![Imagem](${url})`).join("\n")}`;
    } catch (error: any) {
      return `Erro ao gerar imagem: ${error.message}`;
    }
  },
};
