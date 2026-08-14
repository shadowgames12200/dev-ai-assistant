import { createHmac, randomBytes } from "crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const";
import { ForbiddenError } from "../shared/_core/errors";
import * as db from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import type { User } from "../drizzle/schema";
import { z } from "zod";

// ─── Password hashing (HMAC + salt, stored in DB) ───

const loginSchema = z.object({
  email: z.string().min(3).max(320),
  password: z.string().min(6).max(128),
});

function hashPassword(password: string, salt: string): string {
  return createHmac("sha256", salt).update(password).digest("hex");
}

function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

function isOwnerEmail(email: string): boolean {
  const ownerEmail = ENV.ownerOpenId?.startsWith("local:")
    ? ENV.ownerOpenId.replace("local:", "")
    : null;
  const ownerEmails = ownerEmail ? [ownerEmail, "charleshenriquegonsalves05@gmail.com"] : ["charleshenriquegonsalves05@gmail.com"];
  return ownerEmails.includes(email);
}

/**
 * POST /api/auth/login (via express app) - Login ou cadastro automático.
 * Se o usuário não existir, cria automaticamente.
 * Se existir, valida a senha e faz login.
 */
export async function handleLocalLogin(req: any, res: any) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "E-mail e senha são obrigatórios" });
      return;
    }

    const { email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();
    const name = normalizedEmail.split("@")[0];
    const openId = `local:${normalizedEmail}`;

    // Stored credential lives in users.passwordHash / users.salt columns?
    // Simpler: keep a small "credentials" table... For now use DB users metadata
    // columns `loginMethod` — we store salt+hash in a JSON-friendly way is not available,
    // so we use a separate `passwords` helper via db.users custom columns.
    const dbUser = await db.getUserByOpenId(openId);

    if (dbUser && dbUser.loginMethod === "email") {
      // Existing user — validate password
      const stored = await getPasswordRecord(normalizedEmail);
      if (!stored) {
        // User exists but no password record yet: store the new password and allow
        console.log("[Auth] Existing user without stored password, setting it now:", normalizedEmail);
        const salt = generateSalt();
        const passwordHash = hashPassword(password, salt);
        await setPasswordRecord(normalizedEmail, passwordHash, salt);
      } else {
        const hash = hashPassword(password, stored.salt);
        if (hash !== stored.passwordHash) {
          res.status(401).json({ error: "Email ou senha inválidos" });
          return;
        }
      }
    } else {
      // New user - auto-register
      console.log("[Auth] Auto-registering new user:", normalizedEmail);
      const salt = generateSalt();
      const passwordHash = hashPassword(password, salt);
      await setPasswordRecord(normalizedEmail, passwordHash, salt);
    }

    // Role: admin if this is the owner's email
    const isOwner = isOwnerEmail(normalizedEmail);

    await db.upsertUser({
      openId,
      name,
      email: normalizedEmail,
      loginMethod: "email",
      role: isOwner ? "admin" : "user",
      lastSignedIn: new Date(),
    });

    const finalUser = await db.getUserByOpenId(openId);
    if (!finalUser) {
      console.error("[Auth] Failed to get user after upsert");
      res.status(500).json({ error: "Falha ao autenticar usuário" });
      return;
    }

    const sessionToken = await sdk.createSessionToken(finalUser.openId, {
      name: finalUser.name || name,
      expiresInMs: ONE_YEAR_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

    res.json({
      success: true,
      user: {
        id: finalUser.id,
        openId: finalUser.openId,
        name: finalUser.name,
        email: finalUser.email,
        role: finalUser.role,
      },
    });
  } catch (error: any) {
    console.error("[Auth] Local login error:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
}

export async function handleLocalLogout(req: any, res: any) {
  const cookieOptions = getSessionCookieOptions(req);
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: 0 });
  res.json({ success: true });
}

// ─── Password records (small helper table `password_credentials`) ───
// Schema is created manually; helpers below.

export async function getPasswordRecord(email: string): Promise<{ passwordHash: string; salt: string } | null> {
  const sdb = await db.getDb();
  if (!sdb) return null;
  const { sql } = await import("drizzle-orm");
  // drizzle mysql2 adapter: execute() returns the driver result; use raw mysql2
  // connection via the internal pool instead.
  const conn = (sdb as any).session?.client ?? sdb;
  const [rows] = await conn.query(
    "SELECT passwordHash, salt FROM password_credentials WHERE email = ? LIMIT 1",
    [email]
  );
  const list = rows as Array<{ passwordHash: string; salt: string }>
  if (!list || list.length === 0) return null;
  return { passwordHash: list[0].passwordHash, salt: list[0].salt };
}

export async function setPasswordRecord(email: string, passwordHash: string, salt: string) {
  const sdb = await db.getDb();
  if (!sdb) throw new Error("Database not available");
  const conn = (sdb as any).session?.client ?? sdb;
  await conn.query(
    "INSERT INTO password_credentials (email, passwordHash, salt) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE passwordHash = VALUES(passwordHash), salt = VALUES(salt)",
    [email, passwordHash, salt]
  );
}
