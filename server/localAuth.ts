import { createHmac, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const";
import { ForbiddenError } from "../shared/_core/errors";
import * as db from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import type { User } from "../drizzle/schema";
import { z } from "zod";

// ─── Password hashing (scrypt + salt, stored in JSON persistence) ───

const identifierSchema = z.string().trim().min(3).max(320);
const usernameSchema = z.string().trim().min(3).max(40).regex(/^[A-Za-zÀ-ÿ0-9._ -]+$/, "Nome de usuário inválido");
const passwordSchema = z.string().min(6).max(128);

const loginSchema = z.object({
  identifier: identifierSchema.optional(),
  email: identifierSchema.optional(), // compatibilidade com versões anteriores da interface
  password: z.string().min(6).max(128),
}).refine(value => Boolean(value.identifier || value.email), {
  message: "Informe o nome de usuário ou e-mail",
});

const registerSchema = z.object({
  name: usernameSchema,
  email: z.string().trim().email().max(320),
  password: passwordSchema,
});

const accountUpdateSchema = z.object({
  name: usernameSchema,
  email: z.string().trim().email().max(320),
  currentPassword: passwordSchema,
  newPassword: passwordSchema.optional(),
});

const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 10;
const authAttempts = new Map<string, { count: number; resetAt: number }>();
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const SCRYPT_PREFIX = "scrypt$";

function isLoopbackAddress(value: unknown): boolean {
  return value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1";
}

function authRateLimitKey(req: any, action: string) {
  const peerAddress = req.socket?.remoteAddress || req.ip || "unknown";
  const realIp = typeof req.headers?.["x-real-ip"] === "string" ? req.headers["x-real-ip"].trim() : "";
  // O Nginx local substitui X-Real-IP pelo endereço remoto real. X-Forwarded-For
  // pode incluir valores enviados pelo cliente e não deve definir o limite.
  const sourceAddress = isLoopbackAddress(peerAddress) && realIp ? realIp : peerAddress;
  return `${action}:${sourceAddress}`;
}

function consumeAuthAttempt(req: any, action: string) {
  const key = authRateLimitKey(req, action);
  const now = Date.now();
  const current = authAttempts.get(key);
  const next = !current || current.resetAt <= now ? { count: 1, resetAt: now + AUTH_WINDOW_MS } : { ...current, count: current.count + 1 };
  authAttempts.set(key, next);
  return next.count <= AUTH_MAX_ATTEMPTS;
}

function clearAuthAttempts(req: any, action: string) {
  authAttempts.delete(authRateLimitKey(req, action));
}

function legacyHashPassword(password: string, salt: string): string {
  return createHmac("sha256", salt).update(password).digest("hex");
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const derived = await deriveScrypt(password, salt);
  return `${SCRYPT_PREFIX}${derived.toString("base64")}`;
}

function deriveScrypt(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function comparePasswordHashes(expected: Buffer, actual: Buffer): boolean {
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function verifyPassword(password: string, stored: { passwordHash: string; salt: string }) {
  if (!stored.passwordHash.startsWith(SCRYPT_PREFIX)) {
    const candidate = Buffer.from(legacyHashPassword(password, stored.salt), "hex");
    const expected = Buffer.from(stored.passwordHash, "hex");
    return { valid: comparePasswordHashes(expected, candidate), needsUpgrade: true };
  }

  const expected = Buffer.from(stored.passwordHash.slice(SCRYPT_PREFIX.length), "base64");
  const derived = await deriveScrypt(password, stored.salt);
  return { valid: comparePasswordHashes(expected, derived), needsUpgrade: false };
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
 * POST /api/auth/login - autentica uma conta local existente por nome de usuário ou e-mail.
 */
export async function handleLocalLogin(req: any, res: any) {
  try {
    if (!consumeAuthAttempt(req, "login")) {
      res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente." });
      return;
    }
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Informe o nome de usuário ou e-mail e a senha" });
      return;
    }

    const { password } = parsed.data;
    const identifier = (parsed.data.identifier || parsed.data.email || "").trim();
    const dbUser = await db.getUserByLoginIdentifier(identifier);
    if (!dbUser || dbUser.loginMethod !== "email") {
      res.status(401).json({ error: "Nome de usuário/e-mail ou senha inválidos" });
      return;
    }
    const normalizedEmail = String(dbUser.email).toLowerCase().trim();
    const stored = await getPasswordRecord(normalizedEmail);
    if (!stored) {
      res.status(401).json({ error: "Nome de usuário/e-mail ou senha inválidos" });
      return;
    }
    const verification = await verifyPassword(password, stored);
    if (!verification.valid) {
      res.status(401).json({ error: "Nome de usuário/e-mail ou senha inválidos" });
      return;
    }
    if (verification.needsUpgrade) {
      const nextSalt = generateSalt();
      await setPasswordRecord(normalizedEmail, await hashPassword(password, nextSalt), nextSalt);
    }

    await db.upsertUser({
      openId: dbUser.openId,
      name: dbUser.name,
      email: normalizedEmail,
      loginMethod: "email",
      role: dbUser.role || (isOwnerEmail(normalizedEmail) ? "admin" : "user"),
      lastSignedIn: new Date(),
    });

    const finalUser = await db.getUserByOpenId(dbUser.openId);
    if (!finalUser) {
      console.error("[Auth] Failed to get user after upsert");
      res.status(500).json({ error: "Falha ao autenticar usuário" });
      return;
    }

    const sessionToken = await sdk.createSessionToken(finalUser.openId, {
      name: finalUser.name || normalizedEmail.split("@")[0],
      expiresInMs: ONE_YEAR_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    clearAuthAttempts(req, "login");

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

/** POST /api/auth/register - cria explicitamente uma nova conta local. */
export async function handleLocalRegister(req: any, res: any) {
  try {
    if (!consumeAuthAttempt(req, "register")) {
      res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente." });
      return;
    }
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Informe nome de usuário, e-mail válido e senha de pelo menos 6 caracteres" });
      return;
    }
    const { name, email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();
    const salt = generateSalt();
    const created = await db.createLocalAccount({
      name,
      email: normalizedEmail,
      passwordHash: await hashPassword(password, salt),
      salt,
      role: isOwnerEmail(normalizedEmail) ? "admin" : "user",
    });
    if (!created) {
      res.status(409).json({ error: "Esse nome de usuário ou e-mail já está em uso" });
      return;
    }
    const sessionToken = await sdk.createSessionToken(created.openId, { name: created.name, expiresInMs: ONE_YEAR_MS });
    res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
    clearAuthAttempts(req, "register");
    res.status(201).json({ success: true, user: created });
  } catch (error) {
    console.error("[Auth] Local register error:", error);
    res.status(500).json({ error: "Erro interno ao criar a conta" });
  }
}

/** POST /api/auth/account - atualiza nome, e-mail e/ou senha da sessão local atual. */
export async function handleLocalAccountUpdate(req: any, res: any) {
  try {
    const currentUser = await sdk.authenticateRequest(req);
    if (currentUser.loginMethod !== "email") {
      res.status(403).json({ error: "Esta conta não pode ser editada por este formulário" });
      return;
    }
    const parsed = accountUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Preencha nome, e-mail e a senha atual corretamente" });
      return;
    }
    const { name, email, currentPassword, newPassword } = parsed.data;
    const stored = await getPasswordRecord(String(currentUser.email || "").toLowerCase());
    if (!stored) {
      res.status(401).json({ error: "A senha atual não confere" });
      return;
    }
    const verification = await verifyPassword(currentPassword, stored);
    if (!verification.valid) {
      res.status(401).json({ error: "A senha atual não confere" });
      return;
    }
    const passwordToStore = newPassword || (verification.needsUpgrade ? currentPassword : undefined);
    const nextSalt = passwordToStore ? generateSalt() : undefined;
    const result = await db.updateLocalAccount({
      openId: currentUser.openId,
      name,
      email,
      passwordHash: passwordToStore && nextSalt ? await hashPassword(passwordToStore, nextSalt) : undefined,
      salt: nextSalt,
    });
    if (result.status === "duplicate") {
      res.status(409).json({ error: "Esse nome de usuário ou e-mail já está em uso" });
      return;
    }
    if (!result.user) {
      res.status(404).json({ error: "Conta não encontrada" });
      return;
    }
    const sessionToken = await sdk.createSessionToken(result.user.openId, { name: result.user.name, expiresInMs: ONE_YEAR_MS });
    res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
    res.json({ success: true, user: result.user });
  } catch (error) {
    console.error("[Auth] Local account update error:", error);
    res.status(401).json({ error: "Sessão inválida ou expirada. Entre novamente." });
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
  const { passwordCredentials } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const results = await sdb.select().from(passwordCredentials).where(eq(passwordCredentials.email, email)).limit(1);
  if (results.length === 0) return null;
  return { passwordHash: results[0].passwordHash, salt: results[0].salt };
}

export async function setPasswordRecord(email: string, passwordHash: string, salt: string) {
  const sdb = await db.getDb();
  const { passwordCredentials } = await import("../drizzle/schema");
  await sdb.insert(passwordCredentials).values({
    email,
    passwordHash,
    salt,
  }).onConflictDoUpdate({
    target: passwordCredentials.email,
    set: { passwordHash, salt },
  });
}
