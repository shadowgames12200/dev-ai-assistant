import { defineConfig } from "drizzle-kit";

const connectionString = "postgresql://postgres.yhbklxziktdraoueunxx:CharlesHenrique%40963850@aws-1-sa-east-1.pooler.supabase.com:5432/postgres";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
