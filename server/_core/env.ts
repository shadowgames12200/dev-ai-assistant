// Prefer a directly configured provider when one is present. This keeps a
// stale built-in Forge credential from shadowing the provider the app owner chose.
function resolveForgeApiKey(): string {
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
  if (process.env.BUILT_IN_FORGE_API_KEY) return process.env.BUILT_IN_FORGE_API_KEY;
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  return "";
}

function resolveForgeApiUrl(): string {
  if (process.env.GROQ_API_KEY) return "https://api.groq.com/openai/v1";
  if (process.env.BUILT_IN_FORGE_API_URL) return process.env.BUILT_IN_FORGE_API_URL;
  if (process.env.GEMINI_API_KEY) return "https://generativelanguage.googleapis.com/v1beta/openai";
  if (process.env.OPENAI_API_KEY) return "https://api.openai.com/v1";
  return "";
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL?.trim() ?? "",
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
