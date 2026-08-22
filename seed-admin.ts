import { createHmac, randomBytes, scrypt } from "crypto";
import postgres from "postgres";

const connectionString = "postgresql://postgres.yhbklxziktdraoueunxx:CharlesHenrique%40963850@aws-1-sa-east-1.pooler.supabase.com:5432/postgres";
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const SCRYPT_PREFIX = "scrypt$";

function deriveScrypt(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const derived = await deriveScrypt(password, salt);
  return `${SCRYPT_PREFIX}${derived.toString("base64")}`;
}

async function seed() {
  const sql = postgres(connectionString, { prepare: false });
  const email = "charleshenriquegonsalves05@gmail.com";
  const password = "963850";
  const salt = randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(password, salt);
  const openId = `local:${email}`;

  try {
    console.log("Seeding admin user...");
    await sql`
      INSERT INTO users (open_id, name, email, login_method, role)
      VALUES (${openId}, 'Charles Henrique', ${email}, 'email', 'admin')
      ON CONFLICT (open_id) DO UPDATE SET role = 'admin'
    `;

    await sql`
      INSERT INTO password_credentials (email, password_hash, salt)
      VALUES (${email}, ${passwordHash}, ${salt})
      ON CONFLICT (email) DO UPDATE SET password_hash = ${passwordHash}, salt = ${salt}
    `;
    
    console.log("Admin seeded successfully!");
  } catch (e) {
    console.error("Failed to seed admin:", e);
  } finally {
    await sql.end();
  }
}

seed();
