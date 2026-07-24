/**
 * Infrastructure Configuration Module
 * 
 * Centraliza as configurações para as novas funcionalidades (Docker, Supabase, APIs).
 */

export const INFRA_CONFIG = {
  // Configurações de Sandbox
  sandbox: {
    enabled: true,
    engine: "docker", // "docker" ou "local" (local é perigoso)
    defaultTimeout: 45000,
    maxMemory: "512m",
    maxCPUs: "1.0",
  },

  // Configurações de Memória Semântica
  memory: {
    vectorSize: 1536,
    matchThreshold: 0.5,
    maxMatches: 5,
    autoExtractionEnabled: true,
  },

  // Configurações Multimodais
  multimodal: {
    visionModel: "gpt-4o",
    imageGenModel: "dall-e-3",
    defaultImageSize: "1024x1024",
  }
};

/**
 * Verifica se os pré-requisitos do sistema estão instalados
 */
export async function checkSystemRequirements(): Promise<Record<string, boolean>> {
  const { execSync } = await import("child_process");
  
  const results = {
    docker: false,
    supabase: true, // Supabase é externo
    openai_api: false,
  };

  // Check Docker
  try {
    execSync("docker --version", { stdio: "ignore" });
    results.docker = true;
  } catch {}

  // Check OpenAI API (via Forge ou Direct)
  const { ENV } = await import("./env.js");
  if (ENV.forgeApiKey || process.env.OPENAI_API_KEY) {
    results.openai_api = true;
  }

  return results;
}
