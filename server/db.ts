// db.ts — Backend de persistência JSON local (substitui drizzle/MySQL indisponível na VM)
// Compatível com TODAS as assinaturas do db.ts do template Manus.
import fs from "fs";
import path from "path";
import os from "os";

const DATA_DIR = process.env.DATA_DIR || process.cwd() || os.homedir();
const CONVOS_FILE = path.join(DATA_DIR, "convos_data.json");
const USERS_FILE = path.join(DATA_DIR, "users_data.json");

let seq = { msgs: 0, attachments: 0, users: 0 };
let dirty = false;

interface ConvosData {
  convos: any[];
  msgs: any[];
  attachments: any[];
}

interface UsersData {
  profiles: Record<string, any>;
  passwords: Record<string, string>;
}

function loadConvos(): ConvosData {
  try {
    const raw = fs.readFileSync(CONVOS_FILE, "utf-8");
    const d = JSON.parse(raw) as ConvosData;
    d.convos = d.convos || [];
    d.msgs = d.msgs || [];
    d.attachments = d.attachments || [];
    return d;
  } catch {
    return { convos: [], msgs: [], attachments: [] };
  }
}

function saveConvos(d: ConvosData) {
  fs.writeFileSync(CONVOS_FILE, JSON.stringify(d, null, 2), "utf-8");
}

function loadUsers(): UsersData {
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf-8");
    const d = JSON.parse(raw) as UsersData;
    d.profiles = d.profiles || {};
    d.passwords = d.passwords || {};
    return d;
  } catch {
    return { profiles: {}, passwords: {} };
  }
}

function saveUsers(d: UsersData) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(d, null, 2), "utf-8");
}

function nextSeq(kind: "msgs" | "attachments" | "users"): number {
  seq[kind] = (seq[kind] || 0) + 1;
  return seq[kind];
}

// Reaproveita sequências existentes para não colidir com ids já persistidos.
function syncSeq() {
  const c = loadConvos();
  seq.msgs = c.msgs.reduce((m, x) => Math.max(m, x.id || 0), 0);
  seq.attachments = c.attachments.reduce((m, x) => Math.max(m, x.id || 0), 0);
  const u = loadUsers();
  seq.users = Object.values(u.profiles).reduce(
    (m, x) => Math.max(m, Number(x.id) || 0),
    0
  );
}
syncSeq();

// ─── drizzle compat: getDb retorna null (sem MySQL) ───
// Password credentials são armazenadas dentro de users_data.json (campo
// `passwords`) para o login por e-mail/senha funcionar sem banco MySQL.
export async function getDb(): Promise<any> {
  const u = loadUsers();
  const conn = {
    query: async (sql: string, params?: any[]) => {
      const email = params?.[0] as string;
      if (/INSERT INTO password_credentials/.test(sql)) {
        // INSERT ... ON DUPLICATE KEY UPDATE (email, passwordHash, salt)
        if (!u.passwords) u.passwords = {};
        if (params) {
          (u.passwords as any)[email] = {
            email,
            passwordHash: String(params[1]),
            salt: String(params[2]),
          };
          saveUsers(u);
          return [{ affectedRows: 1 }];
        }
        saveUsers(u);
        return [{ affectedRows: 1 }];
      }
      if (/SELECT passwordHash, salt FROM password_credentials/.test(sql)) {
        const rec = u.passwords?.[email] ?? null;
        const rows = rec ? [rec] : [];
        return [rows];
      }
      return [null];
    },
  };
  return conn;
}

// ─── Users ───
export async function upsertUser(user: any): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const u = loadUsers();
  const existing = u.profiles[user.openId];
  if (!existing) {
    seq.users = (seq.users || 0) + 1;
    u.profiles[user.openId] = {
      openId: user.openId,
      id: seq.users,
      createdAt: Date.now(),
      name: user.name || "",
      email: user.email || "",
      loginMethod: user.loginMethod || "email",
      role: user.role || "user",
      lastSignedIn: new Date().toISOString(),
    };
  } else {
    existing.name = user.name !== undefined ? user.name : existing.name;
    existing.email = user.email !== undefined ? user.email : existing.email;
    existing.lastSignedIn = new Date().toISOString();
    if (user.role) existing.role = user.role;
  }
  saveUsers(u);
}

export async function getUserByOpenId(openId: string) {
  const u = loadUsers();
  return u.profiles[openId] || null;
}

export async function updateUserRole(id: number, role: "admin" | "user") {
  const u = loadUsers();
  for (const v of Object.values(u.profiles)) {
    if (Number(v.id) === id) {
      (v as any).role = role;
      saveUsers(u);
      return { id, role };
    }
  }
  return null;
}

// ─── Conversations ───
export async function createConversation(userId: number, title: string) {
  const d = loadConvos();
  const id = (d.convos.reduce((m, c) => Math.max(m, c.id), 0) || 0) + 1;
  d.convos.push({
    id,
    userId,
    title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  saveConvos(d);
  return id;
}

export async function getUserConversations(userId: number) {
  const d = loadConvos();
  return d.convos
    .filter((c) => c.userId === userId)
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export async function getConversation(id: number, userId: number) {
  const d = loadConvos();
  return d.convos.find((c) => c.id === id && c.userId === userId) || null;
}

export async function updateConversationTitle(id: number, title: string) {
  const d = loadConvos();
  const c = d.convos.find((c) => c.id === id);
  if (c) {
    c.title = title;
    c.updatedAt = new Date().toISOString();
    saveConvos(d);
  }
  return { id, title };
}

export async function deleteConversation(id: number, userId: number) {
  const d = loadConvos();
  const c = d.convos.find((c) => c.id === id && c.userId === userId);
  if (!c) return false;
  d.convos = d.convos.filter((c) => c.id !== id);
  d.msgs = d.msgs.filter((m) => m.conversationId !== id);
  d.attachments = d.attachments.filter((a) => a.conversationId !== id);
  saveConvos(d);
  return true;
}

// ─── Messages ───
export async function getConversationMessages(conversationId: number) {
  const d = loadConvos();
  return d.msgs
    .filter((m) => m.conversationId === conversationId)
    .sort((a, b) => a.id - b.id);
}

export async function addMessage(
  conversationId: number,
  role: "user" | "assistant" | "system",
  content: string,
  fileUrl?: string | null,
  fileName?: string | null
) {
  const d = loadConvos();
  const id = (d.msgs.reduce((m, x) => Math.max(m, x.id || 0), 0) || 0) + 1;
  d.msgs.push({
    id,
    conversationId,
    role,
    content,
    fileUrl: fileUrl ?? null,
    fileName: fileName ?? null,
    createdAt: new Date().toISOString(),
  });
  const c = d.convos.find((c) => c.id === conversationId);
  if (c) c.updatedAt = new Date().toISOString();
  saveConvos(d);
  return id;
}

// ─── Attachments ───
export async function addAttachment(attachment: any) {
  const d = loadConvos();
  const id = (d.attachments.reduce((m, x) => Math.max(m, x.id || 0), 0) || 0) + 1;
  d.attachments.push({
    id,
    conversationId: attachment.conversationId,
    userId: attachment.userId,
    fileName: attachment.fileName,
    fileType: attachment.fileType,
    fileSize: attachment.fileSize,
    storageUrl: attachment.storageUrl,
    createdAt: new Date().toISOString(),
  });
  saveConvos(d);
  return id;
}

export async function getConversationAttachments(conversationId: number) {
  const d = loadConvos();
  return d.attachments
    .filter((a) => a.conversationId === conversationId)
    .sort((a, b) => a.id - b.id);
}

export async function deleteAttachments(ids: number[]) {
  const d = loadConvos();
  d.attachments = d.attachments.filter((a) => !ids.includes(a.id));
  saveConvos(d);
  return { success: true };
}

// ─── Admin helpers ───
export async function getUserById(id: number) {
  const u = loadUsers();
  for (const v of Object.values(u.profiles)) {
    if (Number((v as any).id) === id) return v;
  }
  return null;
}

export async function getAllUsers() {
  const u = loadUsers();
  return Object.values(u.profiles).sort(
    (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
  );
}
