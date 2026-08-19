// Fallback para VM local: se BUILT_IN_FORGE_API_KEY não está disponível,
// usar as keys diretas do .env (GEMINI_API_KEY > GROQ_API_KEY > OPENAI_API_KEY)
function resolveForgeApiKey(): string {
  if (process.env.BUILT_IN_FORGE_API_KEY) return process.env.BUILT_IN_FORGE_API_KEY;
  // Local VM fallback: try Gemini first, then Groq, then OpenAI
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  return "";
}

function resolveForgeApiUrl(): string {
  if (process.env.BUILT_IN_FORGE_API_URL) return process.env.BUILT_IN_FORGE_API_URL;
  // Local VM fallback: use Gemini-compatible endpoint
  if (process.env.GEMINI_API_KEY) return "https://generativelanguage.googleapis.com/v1beta/openai";
  if (process.env.GROQ_API_KEY) return "https://api.groq.com/openai/v1";
  if (process.env.OPENAI_API_KEY) return "https://api.openai.com/v1";
  return "";
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: resolveForgeApiUrl(),
  forgeApiKey: resolveForgeApiKey(),
  // Direct access to local keys for model-specific routing
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
};
