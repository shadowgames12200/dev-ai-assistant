import { createHmac, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { COOKIE_NAME, SESSION_MAX_AGE_MS } from "../shared/const";
import { ForbiddenError } from "../shared/_core/errors";
import * as db from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import type { User } from "../drizzle/schema";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { REGISTRATION_LIMIT_PER_SOURCE, buildBlockMessage, getAccountBlockState, getRegistrationCount, getSupportLinks, recordSuccessfulRegistration } from "./abuseProtection";
import * as schema from "../drizzle/schema";

const identifierSchema = z.string().trim().min(3).max(320);
const usernameSchema = z.string().trim().min(3).max(40).regex(/^[A-Za-zÀ-ÿ0-9._ -]+$/, "Nome de usuário inválido");
const passwordSchema = z.string().min(6).max(128);

const loginSchema = z.object({
  identifier: identifierSchema.optional(),
  email: identifierSchema.optional(),
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
  const configuredOwner = ENV.ownerOpenId.trim().toLowerCase();
  if (!configuredOwner) return false;

  const ownerEmail = configuredOwner.startsWith("local:")
    ? configuredOwner.slice("local:".length)
    : configuredOwner;
  return ownerEmail === email.trim().toLowerCase();
}

export async function handleLocalLogin(req: any, res: any) {
  console.log(`[Auth] Login attempt for: ${req.body?.identifier || req.body?.email}`);
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

    const blockState = getAccountBlockState(dbUser);
    if (blockState.blocked) {
      res.status(403).json({
        error: buildBlockMessage(blockState),
        code: "ACCOUNT_BLOCKED",
        blockedUntil: blockState.until?.toISOString() ?? null,
        support: getSupportLinks(),
      });
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
      role: isOwnerEmail(normalizedEmail) ? "admin" : (dbUser.role || "user"),
      lastSignedIn: new Date(),
    });

    const finalUser = await db.getUserByOpenId(dbUser.openId);
    if (!finalUser) {
      res.status(500).json({ error: "Falha ao autenticar usuário" });
      return;
    }

    const sessionToken = await sdk.createSessionToken(finalUser.openId, {
      name: finalUser.name || normalizedEmail.split("@")[0],
      expiresInMs: SESSION_MAX_AGE_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_MAX_AGE_MS });
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

export async function handleLocalRegister(req: any, res: any) {
  try {
    if (!consumeAuthAttempt(req, "register")) {
      res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente." });
      return;
    }
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || "Dados inválidos" });
      return;
    }

    const { name, email, password } = parsed.data;
    if (getRegistrationCount(req) >= REGISTRATION_LIMIT_PER_SOURCE) {
      res.status(429).json({
        error: "Não foi possível criar outra conta agora. Se você acredita que isso é um engano, solicite uma revisão pelo suporte.",
        code: "ACCOUNT_CREATION_LIMIT",
        support: getSupportLinks(),
      });
      return;
    }
    const existing = await db.getUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: "Este e-mail já está em uso" });
      return;
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);
    const role = isOwnerEmail(email) ? "admin" : "user";

    const user = await db.createLocalAccount({
      name,
      email,
      passwordHash,
      salt,
      role,
    });

    if (!user) {
      res.status(500).json({ error: "Falha ao criar conta" });
      return;
    }

    recordSuccessfulRegistration(req);

    const sessionToken = await sdk.createSessionToken(user.openId, {
      name: user.name || email.split("@")[0],
      expiresInMs: SESSION_MAX_AGE_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_MAX_AGE_MS });
    clearAuthAttempts(req, "register");

    res.json({ success: true, user });
  } catch (error: any) {
    console.error("[Auth] Local register error:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
}

export async function handleLocalAccountUpdate(req: any, res: any) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      res.status(401).json({ error: "Não autorizado" });
      return;
    }

    const parsed = accountUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || "Dados inválidos" });
      return;
    }

    const { name, email, currentPassword, newPassword } = parsed.data;
    const stored = await getPasswordRecord(String(user.email));
    if (!stored) {
      res.status(401).json({ error: "Credenciais não encontradas" });
      return;
    }

    const verification = await verifyPassword(currentPassword, stored);
    if (!verification.valid) {
      res.status(401).json({ error: "Senha atual incorreta" });
      return;
    }

    let passwordHash = undefined;
    let salt = undefined;
    if (newPassword) {
      salt = generateSalt();
      passwordHash = await hashPassword(newPassword, salt);
    }

    const result = await db.updateLocalAccount({
      openId: user.openId,
      name,
      email,
      oldEmail: user.email,
      passwordHash,
      salt,
    });

    if (result.status === "duplicate") {
      res.status(409).json({ error: "Este e-mail já está em uso" });
      return;
    }

    if (result.status === "success") {
      const updatedUser = result.user && user.openId === ENV.ownerOpenId.trim()
        ? { ...result.user, role: "admin" }
        : result.user;
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: name || email.split("@")[0],
        expiresInMs: SESSION_MAX_AGE_MS,
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_MAX_AGE_MS });
      res.json({ success: true, user: updatedUser });
    } else {
      res.status(500).json({ error: "Falha ao atualizar conta" });
    }
  } catch (error: any) {
    console.error("[Auth] Account update error:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
}

export async function handleLocalLogout(req: any, res: any) {
  const cookieOptions = getSessionCookieOptions(req);
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: 0 });
  res.json({ success: true });
}

async function getPasswordRecord(email: string): Promise<{ passwordHash: string; salt: string } | null> {
  const sdb = await db.getDb();
  const results = await sdb.select().from(schema.passwordCredentials).where(eq(schema.passwordCredentials.email, email)).limit(1);
  if (results.length === 0) return null;
  return { passwordHash: results[0].passwordHash, salt: results[0].salt };
}

async function setPasswordRecord(email: string, passwordHash: string, salt: string) {
  const sdb = await db.getDb();
  await sdb.insert(schema.passwordCredentials).values({
    email,
    passwordHash,
    salt,
  }).onConflictDoUpdate({
    target: schema.passwordCredentials.email,
    set: { passwordHash, salt },
  });
}
