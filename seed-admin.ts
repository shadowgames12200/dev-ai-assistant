import { createHmac, randomBytes, scrypt } from "crypto";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL?.trim();
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
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to seed the admin account.");
  }

  const sql = postgres(connectionString, { prepare: false });
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "Administrador";

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required to seed the admin account.");
  }
  const salt = randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(password, salt);
  const openId = `local:${email}`;

  try {
    console.log("Seeding admin user...");
    await sql`
      INSERT INTO users (open_id, name, email, login_method, role)
      VALUES (${openId}, ${name}, ${email}, 'email', 'admin')
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
