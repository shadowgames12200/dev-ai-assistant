// db.ts — Backend de persistência JSON local (substitui drizzle/MySQL indisponível na VM)
// Compatível com TODAS as assinaturas do db.ts do template Manus.
import fs from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";

const DATA_DIR = process.env.DATA_DIR || process.cwd() || os.homedir();
const CONVOS_FILE = path.join(DATA_DIR, "convos_data.json");
const USERS_FILE = path.join(DATA_DIR, "users_data.json");
const LEARNING_FILE = path.join(DATA_DIR, "learning_opportunities.json");
const RECHARGES_FILE = path.join(DATA_DIR, "pix_recharges_data.json");

let seq = { msgs: 0, attachments: 0, users: 0 };
let dirty = false;

interface ConvosData {
  convos: any[];
  msgs: any[];
  attachments: any[];
}

interface UsersData {
  profiles: Record<string, any>;
  passwords: Record<string, { email: string; passwordHash: string; salt: string }>;
}

export type LearningCategory =
  | "segurança"
  | "programação"
  | "automação"
  | "arquivos"
  | "redação"
  | "experiência do usuário"
  | "desempenho";

export interface LearningOpportunity {
  id: string;
  category: LearningCategory;
  reason: string;
  status: "pending" | "proposed" | "dismissed";
  createdAt: string;
  proposalId?: string;
}

export type RechargeStatus = "pending" | "approved" | "rejected";

export interface RechargeRequest {
  id: string;
  userId: number;
  userEmail: string;
  packageId: string;
  amountCents: number;
  credits: number;
  status: RechargeStatus;
  createdAt: string;
  updatedAt: string;
  decidedAt?: string;
  decidedByUserId?: number;
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

function loadLearningOpportunities(): LearningOpportunity[] {
  try {
    const raw = fs.readFileSync(LEARNING_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.opportunities) ? parsed.opportunities : [];
  } catch {
    return [];
  }
}

function saveLearningOpportunities(opportunities: LearningOpportunity[]) {
  fs.writeFileSync(LEARNING_FILE, JSON.stringify({ opportunities }, null, 2), "utf-8");
}

function loadRechargeRequests(): RechargeRequest[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(RECHARGES_FILE, "utf-8"));
    return Array.isArray(parsed?.requests) ? parsed.requests : [];
  } catch {
    return [];
  }
}

function saveRechargeRequests(requests: RechargeRequest[]) {
  fs.writeFileSync(RECHARGES_FILE, JSON.stringify({ requests }, null, 2), "utf-8");
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

/** Encontra uma conta local pelo e-mail ou pelo nome de usuário, sem distinguir maiúsculas/minúsculas. */
export async function getUserByLoginIdentifier(identifier: string) {
  const normalized = identifier.trim().toLowerCase();
  const u = loadUsers();
  return Object.values(u.profiles).find((profile: any) =>
    String(profile.email || "").trim().toLowerCase() === normalized ||
    String(profile.name || "").trim().toLowerCase() === normalized
  ) || null;
}

export async function createLocalAccount(input: {
  name: string;
  email: string;
  passwordHash: string;
  salt: string;
  role: "admin" | "user";
}) {
  const u = loadUsers();
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedName = input.name.trim().toLowerCase();
  const duplicate = Object.values(u.profiles).some((profile: any) =>
    String(profile.email || "").trim().toLowerCase() === normalizedEmail ||
    String(profile.name || "").trim().toLowerCase() === normalizedName
  );
  if (duplicate) return null;

  seq.users = Math.max(seq.users || 0, ...Object.values(u.profiles).map((profile: any) => Number(profile.id) || 0)) + 1;
  const openId = `local:${normalizedEmail}`;
  const profile = {
    openId,
    id: seq.users,
    createdAt: Date.now(),
    name: input.name.trim(),
    email: normalizedEmail,
    loginMethod: "email",
    role: input.role,
    lastSignedIn: new Date().toISOString(),
  };
  u.profiles[openId] = profile;
  u.passwords[normalizedEmail] = { email: normalizedEmail, passwordHash: input.passwordHash, salt: input.salt };
  saveUsers(u);
  return profile;
}

/**
 * Atualiza os dados de uma conta local preservando o id numérico.
 * Créditos e conversas usam esse id, portanto permanecem vinculados à conta.
 */
export async function updateLocalAccount(input: {
  openId: string;
  name: string;
  email: string;
  passwordHash?: string;
  salt?: string;
}) {
  const u = loadUsers();
  const current = u.profiles[input.openId];
  if (!current) return { status: "not_found" as const, user: null };

  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedName = input.name.trim().toLowerCase();
  const emailOrNameTaken = Object.entries(u.profiles).some(([openId, profile]: [string, any]) =>
    openId !== input.openId && (
      String(profile.email || "").trim().toLowerCase() === normalizedEmail ||
      String(profile.name || "").trim().toLowerCase() === normalizedName
    )
  );
  if (emailOrNameTaken) return { status: "duplicate" as const, user: null };

  const oldEmail = String(current.email || "").trim().toLowerCase();
  const nextOpenId = `local:${normalizedEmail}`;
  const updated = {
    ...current,
    openId: nextOpenId,
    name: input.name.trim(),
    email: normalizedEmail,
    lastSignedIn: new Date().toISOString(),
  };

  if (nextOpenId !== input.openId) delete u.profiles[input.openId];
  u.profiles[nextOpenId] = updated;
  if (oldEmail !== normalizedEmail && u.passwords[oldEmail]) {
    const passwordRecord = u.passwords[oldEmail];
    delete u.passwords[oldEmail];
    u.passwords[normalizedEmail] = { ...passwordRecord, email: normalizedEmail };
  }
  if (input.passwordHash && input.salt) {
    u.passwords[normalizedEmail] = { email: normalizedEmail, passwordHash: input.passwordHash, salt: input.salt };
  }
  saveUsers(u);
  return { status: "updated" as const, user: updated };
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

export async function clearUserConversations(userId: number) {
  const d = loadConvos();
  const userConvoIds = d.convos.filter((c) => c.userId === userId).map((c) => c.id);
  const deletedCount = userConvoIds.length;
  d.convos = d.convos.filter((c) => c.userId !== userId);
  d.msgs = d.msgs.filter((m) => !userConvoIds.includes(m.conversationId));
  d.attachments = d.attachments.filter((a) => !userConvoIds.includes(a.conversationId));
  saveConvos(d);
  return deletedCount;
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

// ─── Solicitações de recarga Pix ───
// Estes registros representam apenas uma intenção de pagamento. A confirmação
// continua sendo feita manualmente pelo proprietário fora da aplicação.
export function createRechargeRequest(input: {
  userId: number;
  userEmail: string;
  packageId: string;
  amountCents: number;
  credits: number;
}): RechargeRequest {
  const requests = loadRechargeRequests();
  const existing = requests.find((request) =>
    request.status === "pending" && request.userId === input.userId && request.packageId === input.packageId
  );
  if (existing) return existing;
  const now = new Date().toISOString();
  const request: RechargeRequest = {
    id: `pix_${randomUUID()}`,
    userId: input.userId,
    userEmail: input.userEmail,
    packageId: input.packageId,
    amountCents: input.amountCents,
    credits: input.credits,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  requests.unshift(request);
  saveRechargeRequests(requests.slice(0, 1000));
  return request;
}

export function listRechargeRequests(status?: RechargeStatus): RechargeRequest[] {
  return loadRechargeRequests()
    .filter((request) => !status || request.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listUserRechargeRequests(userId: number): RechargeRequest[] {
  return listRechargeRequests().filter((request) => request.userId === userId);
}

export function getRechargeRequest(id: string): RechargeRequest | null {
  return loadRechargeRequests().find((request) => request.id === id) ?? null;
}

export function markRechargeApproved(id: string, adminUserId: number): RechargeRequest | null {
  const requests = loadRechargeRequests();
  const request = requests.find((item) => item.id === id);
  if (!request || request.status === "rejected") return null;
  if (request.status === "pending") {
    const now = new Date().toISOString();
    request.status = "approved";
    request.updatedAt = now;
    request.decidedAt = now;
    request.decidedByUserId = adminUserId;
    saveRechargeRequests(requests);
  }
  return request;
}

export function markRechargeRejected(id: string, adminUserId: number): RechargeRequest | null {
  const requests = loadRechargeRequests();
  const request = requests.find((item) => item.id === id);
  if (!request || request.status !== "pending") return null;
  const now = new Date().toISOString();
  request.status = "rejected";
  request.updatedAt = now;
  request.decidedAt = now;
  request.decidedByUserId = adminUserId;
  saveRechargeRequests(requests);
  return request;
}

// ─── Oportunidades de autoaprendizagem ───
// A fila nunca armazena texto, anexo, identificador de usuário ou credencial.
// Ela registra somente uma categoria pré-definida e uma justificativa genérica.
export function detectSafeLearningCategory(content: string): LearningCategory | null {
  const normalized = content.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/(senha|password|token|api[ _-]?key|chave privada|credential|segredo)/.test(normalized)) return null;
  if (/(invas|seguranc|vazament|autentic|login|permiss|privacidade)/.test(normalized)) return "segurança";
  if (/(codigo|programa|typescript|javascript|python|bug|erro|api|github|repositorio)/.test(normalized)) return "programação";
  if (/(automat|integr|webhook|fluxo|\bbot\b)/.test(normalized)) return "automação";
  if (/(anexo|pdf|docx|xlsx|planilha|arquivo|audio|transcri)/.test(normalized)) return "arquivos";
  if (/(redacao|revisao|curriculo|texto|artigo|traducao)/.test(normalized)) return "redação";
  if (/(interface|botao|tela|menu|cadastro|conta|usuario)/.test(normalized)) return "experiência do usuário";
  if (/(lento|memoria|desempenho|performance|vm)/.test(normalized)) return "desempenho";
  return null;
}

export function recordLearningOpportunity(category: LearningCategory): LearningOpportunity | null {
  const opportunities = loadLearningOpportunities();
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const alreadyQueued = opportunities.some((item) =>
    item.category === category && item.status === "pending" && new Date(item.createdAt).getTime() >= oneWeekAgo
  );
  if (alreadyQueued) return null;
  const opportunity: LearningOpportunity = {
    id: `learn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    category,
    reason: `Uma necessidade relacionada a ${category} foi identificada de forma genérica em uma conversa.`,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  opportunities.unshift(opportunity);
  saveLearningOpportunities(opportunities.slice(0, 100));
  return opportunity;
}

export function listLearningOpportunities(status?: LearningOpportunity["status"]) {
  return loadLearningOpportunities()
    .filter((item) => !status || item.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function markLearningOpportunitiesProposed(ids: string[], proposalId: string) {
  const opportunities = loadLearningOpportunities().map((item) =>
    ids.includes(item.id) && item.status === "pending"
      ? { ...item, status: "proposed" as const, proposalId }
      : item
  );
  saveLearningOpportunities(opportunities);
  return opportunities.filter((item) => item.proposalId === proposalId);
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
