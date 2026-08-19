// Sistema de créditos — fonte TypeScript (espelha dist/server/_core/credits.js)
import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import path from "path";

const APP_DIR = process.cwd();
let DATABASE_URL: string = process.env.DATABASE_URL || "";
if (!DATABASE_URL) {
  try {
    DATABASE_URL = readFileSync(path.join(APP_DIR, ".env"), "utf-8")
      .split(String.fromCharCode(10))
      .map((l) => l.trim())
      .find((l) => l.startsWith("DATABASE_URL="))
      ?.split("=")
      .slice(1)
      .join("=")
      ?.trim() || "";
  } catch (e: any) {
    /* sem .env */
  }
}

let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (pool) return pool;
  const url = DATABASE_URL.replace(/^postgresql/, "mysql");
  const u = new URL(url);
  pool = mysql.createPool({
    host: u.hostname,
    port: Number(u.port) || 3306,
    user: u.username,
    password: decodeURIComponent(u.password || ""),
    database: decodeURIComponent(u.pathname.replace("/", "")),
    ssl:
      u.searchParams.get("ssl") === "true" || u.searchParams.has("sslmode")
        ? { rejectUnauthorized: false }
        : undefined,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });
  return pool;
}

async function query<T = any>(sql: string, params: any[] = []): Promise<T> {
  const p = getPool();
  const [rows] = await p.query(sql, params);
  return rows as T;
}

export const TRIAL_AMOUNT = 50;

// ─── JSON fallback persistence (no MySQL needed) ────────────────────────
import { readFileSync as _rdf, writeFileSync as _wdf, existsSync as _exs } from "fs";
const _CRED_FILE = path.join(APP_DIR, "credits_data.json");
let _credCache: Record<string, { balance: number; trial_granted: boolean; email: string | null; created_at: number }> = {};
function _loadCreds() {
  try {
    if (_exs(_CRED_FILE)) _credCache = JSON.parse(_rdf(_CRED_FILE, "utf-8")).users || {};
    else _credCache = {};
  } catch { _credCache = {}; }
}
function _saveCreds() {
  try { _wdf(_CRED_FILE, JSON.stringify({ users: _credCache }, null, 2)); }
  catch (e: any) { console.warn("[Credits] save failed:", e?.message); }
}
async function _jsonGetBalance(userId: number): Promise<number> {
  _loadCreds();
  const e = _credCache[String(userId)];
  return e ? Number(e.balance || 0) : 0;
}
async function _jsonAdjust(userId: number, amount: number): Promise<boolean> {
  _loadCreds();
  const k = String(userId);
  const e = _credCache[k] || { balance: 0, trial_granted: false, email: null, created_at: Date.now() };
  e.balance = Math.max(0, (e.balance || 0) + amount);
  _credCache[k] = e;
  _saveCreds();
  return true;
}
async function _jsonGrantTrial(userId: number): Promise<boolean> {
  _loadCreds();
  const k = String(userId);
  let e = _credCache[k];
  if (e?.trial_granted) return true;
  e = { balance: (e?.balance || 0) + TRIAL_AMOUNT, trial_granted: true, email: null, created_at: Date.now() };
  _credCache[k] = e;
  _saveCreds();
  console.log("[Credits] Trial de", TRIAL_AMOUNT, "concedido ao usuário", userId);
  return true;
}
// ────────────────────────────────────────────────────────────────────────


export async function ensureTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS credits (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL UNIQUE,
        balance INT NOT NULL DEFAULT 0,
        trial_granted TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e: any) {
    console.warn("[Credits] ensureTable:", e.code || e.message);
  }
}

export async function getBalance(userId: number): Promise<number> {
  return await _jsonGetBalance(userId);
}

export async function adjust(userId: number, amount: number): Promise<boolean> {
  return await _jsonAdjust(userId, amount);
}

export async function grantTrial(userId: number): Promise<boolean> {
  return await _jsonGrantTrial(userId);
}

async function _findUserIdByEmail(email: string): Promise<number | null> {
  try {
    const os = await import("os");
    const fs = await import("fs");
    const dir = process.env.DATA_DIR || process.cwd() || os.homedir();
    const u = JSON.parse(fs.readFileSync(path.join(dir, "users_data.json"), "utf-8"));
    for (const v of Object.values(u?.profiles || {}) as any[]) {
      if ((v.email || "").toLowerCase() === email.toLowerCase()) return Number(v.id);
    }
    return null;
  } catch (e: any) {
    console.warn("[Credits] _findUserIdByEmail:", e?.message);
    return null;
  }
}

export async function addCredits(email: string, amount: number): Promise<boolean> {
  try {
    let userId = await _findUserIdByEmail(email);
    // Fallback para MySQL (quando estiver disponível): busca por SQL
    if (userId === null && DATABASE_URL) {
      try {
        const users = await query<any[]>("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
        if (users && users[0]) userId = Number(users[0].id);
      } catch { /* usar userId encontrado via JSON ou null */ }
    }
    if (userId === null || isNaN(userId) || userId <= 0) {
      console.warn("[Credits] usuário não encontrado para o e-mail", email);
      return false;
    }
    const ok = await _jsonAdjust(userId, amount);
    console.log("[Credits]", amount, "créditos adicionados para", email, "(user", userId, ")");
    return ok;
  } catch (e: any) {
    console.warn("[Credits] addCredits:", e.code || e.message);
    return false;
  }
}

export async function listUsers(): Promise<any[]> {
  try {
    const rows = await query<any[]>(`
      SELECT u.id, u.email, u.name, u.role,
             COALESCE(c.balance, 0) AS balance,
             COALESCE(c.trial_granted, 0) AS trial_granted
      FROM users u
      LEFT JOIN credits c ON c.user_id = u.id
      ORDER BY u.id ASC
    `);
    if (rows && rows.length > 0) return rows;
    // MySQL indisponível ou vazio: fallback JSON
    return await listUsersJson();
  } catch (e: any) {
    console.warn("[Credits] listUsers:", e.code || e.message);
    // Fallback JSON quando o MySQL falhar
    return await listUsersJson();
  }
}

async function listUsersJson(): Promise<any[]> {
  try {
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");
    const dir = process.env.DATA_DIR || process.cwd() || os.homedir();
    const users = JSON.parse(fs.readFileSync(path.join(dir, "users_data.json"), "utf-8"));
    const credits = JSON.parse(fs.readFileSync(path.join(dir, "credits_data.json"), "utf-8"));
    const profiles = users?.profiles || {};
    return Object.values(profiles)
      .map((u: any) => {
        const c = credits?.users?.[String(u.id)] || credits?.users?.[Number(u.id)] || {};
        return {
          id: Number(u.id),
          email: u.email || "",
          name: u.name || "",
          role: u.role || "user",
          balance: c.balance ?? 0,
          trial_granted: c.trial_granted ? 1 : 0,
        };
      })
      .sort((a: any, b: any) => a.id - b.id);
  } catch {
    return [];
  }
}



// Custo por mensagem (configurável pelo admin; padrão 1)
let costPerMessage = Number(process.env.CREDIT_COST_PER_MESSAGE || 1) || 1;
// Custo modo agente (fixo 5, 5x mais pesado que chat normal)
export const AGENT_COST_PER_MESSAGE = 5;

export function getCostPerMessage(): number {
  return costPerMessage;
}

export function setCostPerMessage(value: number): void {
  costPerMessage = Math.max(0, Math.min(100, Math.floor(value)));
  console.log("[Credits] custo por mensagem definido:", costPerMessage);
}
