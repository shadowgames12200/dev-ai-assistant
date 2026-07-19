export const ENV = {
  appId: process.env.VITE_APP_ID ?? "dev-ai-assistant",
  cookieSecret: process.env.JWT_SECRET ?? "dev-ai-assistant-secret-key-default",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.OPENAI_API_BASE ?? process.env.BUILT_IN_FORGE_API_URL ?? "https://forge.manus.im/v1",
  forgeApiKey: process.env.OPENAI_API_KEY ?? process.env.BUILT_IN_FORGE_API_KEY ?? "",
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "",
};
