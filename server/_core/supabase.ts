import { createClient } from "@supabase/supabase-js";
import { ENV } from "./env.js";

if (!ENV.supabaseUrl || !ENV.supabaseAnonKey) {
  console.warn("[Supabase] SUPABASE_URL or SUPABASE_ANON_KEY is missing. Auth will not work correctly.");
}

// Garantir que a URL e a Key sejam strings válidas para o createClient, evitando erro fatal na inicialização
const validUrl = ENV.supabaseUrl || "https://placeholder.supabase.co";
const validKey = ENV.supabaseAnonKey || "placeholder";

export const supabase = createClient(validUrl, validKey);
