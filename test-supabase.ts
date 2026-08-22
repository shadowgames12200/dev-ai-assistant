import postgres from "postgres";

const connectionString = "postgresql://postgres.yhbklxziktdraoueunxx:CharlesHenrique%40963850@aws-1-sa-east-1.pooler.supabase.com:5432/postgres";

async function test() {
  console.log("Connecting to Supabase...");
  const sql = postgres(connectionString, { prepare: false });
  try {
    const result = await sql`SELECT NOW()`;
    console.log("Success! Database time:", result[0].now);
    
    console.log("Checking tables...");
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log("Tables found:", tables.map(t => t.table_name).join(", "));
  } catch (e) {
    console.error("Failed to connect:", e);
  } finally {
    await sql.end();
  }
}

test();
