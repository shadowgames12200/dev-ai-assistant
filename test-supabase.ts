import postgres from "postgres";

const connectionString = process.env.DATABASE_URL?.trim();

async function test() {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to test the Supabase connection.");
  }

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
