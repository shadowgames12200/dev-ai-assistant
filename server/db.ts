import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { InsertUser, users, conversations, messages, InsertConversation, InsertMessage } from "../drizzle/schema.js";
import { ENV } from './_core/env.js';
import fs from 'node:fs';
import path from 'node:path';

let _db: ReturnType<typeof drizzle> | null = null;
let _dbConnectAttempted = false;

// In-memory fallback with file persistence for local/hybrid mode
const LOCAL_DB_PATH = path.resolve(process.cwd(), 'local_db.json');
let memoryUsers: Map<string, any> = new Map();
let memoryConversations: Map<number, any> = new Map();
let memoryMessages: Map<number, any[]> = new Map();
let memoryConvIdCounter = 1;
let memoryMsgIdCounter = 1;

// Carregar dados do arquivo se existir (Modo Híbrido/Local)
function loadLocalDb() {
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const data = JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf-8'));
      memoryUsers = new Map(Object.entries(data.users || {}));
      memoryConversations = new Map(Object.entries(data.conversations || {}).map(([k, v]) => [parseInt(k), v]));
      memoryMessages = new Map(Object.entries(data.messages || {}).map(([k, v]) => [parseInt(k), v]));
      memoryConvIdCounter = data.convIdCounter || 1;
      memoryMsgIdCounter = data.msgIdCounter || 1;
      console.log(`[Database] Dados locais carregados de ${LOCAL_DB_PATH}`);
    }
  } catch (err) {
    console.error("[Database] Erro ao carregar banco local:", err);
  }
}

function saveLocalDb() {
  try {
    const data = {
      users: Object.fromEntries(memoryUsers),
      conversations: Object.fromEntries(memoryConversations),
      messages: Object.fromEntries(memoryMessages),
      convIdCounter: memoryConvIdCounter,
      msgIdCounter: memoryMsgIdCounter,
    };
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("[Database] Erro ao salvar banco local:", err);
  }
}

loadLocalDb();

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (_db) return _db;
  if (_dbConnectAttempted) return null;

  if (!ENV.databaseUrl) {
    _dbConnectAttempted = true;
    console.warn("[Database] DATABASE_URL is not set. Using in-memory fallback.");
    return null;
  }

  _dbConnectAttempted = true;
  try {
    const client = postgres(ENV.databaseUrl, {
      ssl: 'require',
      connect_timeout: 10,
    });
    _db = drizzle(client);
    console.log("[Database] Connected to database successfully.");
    return _db;
  } catch (error) {
    console.warn("[Database] Failed to connect to database:", (error as Error).message);
    _db = null;
    return null;
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  console.log("[Database] Tentando upsert do usuário:", user.openId);
  const db = await getDb();
  if (!db) {
    // Fallback: store in memory
    console.log("[Database] Using in-memory fallback for upsertUser");
    const dbUser = memoryUsers.get(user.openId);
    const newEntry = {
      id: dbUser?.id || memoryUsers.size + 1,
      openId: user.openId,
      name: user.name || null,
      email: user.email || null,
      loginMethod: user.loginMethod || 'email',
      role: user.role || 'user',
      createdAt: dbUser?.createdAt || new Date(),
      updatedAt: new Date(),
      lastSignedIn: user.lastSignedIn || new Date(),
    };
    memoryUsers.set(user.openId, newEntry);
    saveLocalDb();
    console.log("[Database] User stored in memory:", newEntry.openId);
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };

    if (user.name !== undefined) values.name = user.name;
    if (user.email !== undefined) values.email = user.email;
    if (user.loginMethod !== undefined) values.loginMethod = user.loginMethod;
    if (user.lastSignedIn !== undefined) values.lastSignedIn = user.lastSignedIn;
    if (user.role !== undefined) {
      values.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
    } else {
      values.role = 'user';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: {
        name: values.name,
        email: values.email,
        loginMethod: values.loginMethod,
        lastSignedIn: values.lastSignedIn,
        role: values.role,
        updatedAt: new Date(),
      },
    });
    console.log("[Database] User upserted successfully:", user.openId);
  } catch (error) {
    console.error("[Database] Failed to upsert user in DB, falling back to memory:", error);
    // Fallback to memory
    memoryUsers.set(user.openId, {
      id: memoryUsers.size + 1,
      openId: user.openId,
      name: user.name || null,
      email: user.email || null,
      loginMethod: user.loginMethod || 'email',
      role: user.role || 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: user.lastSignedIn || new Date(),
    });
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    // Fallback: check memory
    const memUser = memoryUsers.get(openId);
    if (memUser) return memUser;
    return undefined;
  }

  try {
    const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    console.warn("[Database] Failed to get user by openId:", error);
    const memUser = memoryUsers.get(openId);
    return memUser || undefined;
  }
}

// ─── Conversations ───

export async function createConversation(userId: number, title: string) {
  const db = await getDb();
  if (!db) {
    // Fallback: memory
    const id = memoryConvIdCounter++;
    const conv = { id, userId, title, createdAt: new Date(), updatedAt: new Date() };
    memoryConversations.set(id, conv);
    memoryMessages.set(id, []);
    saveLocalDb();
    return id;
  }

  try {
    const result = await db.insert(conversations).values({ userId, title }).returning({ id: conversations.id });
    return result[0].id;
  } catch (error) {
    console.warn("[Database] Failed to create conversation, using memory fallback");
    const id = memoryConvIdCounter++;
    const conv = { id, userId, title, createdAt: new Date(), updatedAt: new Date() };
    memoryConversations.set(id, conv);
    memoryMessages.set(id, []);
    saveLocalDb();
    return id;
  }
}

export async function getUserConversations(userId: number) {
  const db = await getDb();
  if (!db) {
    const memConvs = Array.from(memoryConversations.values())
      .filter(c => c.userId === userId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return memConvs;
  }

  try {
    return await db.select().from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt));
  } catch (error) {
    console.warn("[Database] Failed to get user conversations");
    return [];
  }
}

export async function getConversation(id: number, userId: number) {
  const db = await getDb();
  if (!db) {
    const conv = memoryConversations.get(id);
    if (conv && conv.userId !== userId) return undefined;
    return conv;
  }

  try {
    const result = await db.select().from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    const conv = result[0];
    if (conv && conv.userId !== userId) return undefined;
    return conv;
  } catch (error) {
    console.warn("[Database] Failed to get conversation");
    const conv = memoryConversations.get(id);
    if (conv && conv.userId !== userId) return undefined;
    return conv;
  }
}

export async function updateConversationTitle(id: number, title: string) {
  const db = await getDb();
  if (!db) {
    const conv = memoryConversations.get(id);
    if (conv) {
      conv.title = title;
      conv.updatedAt = new Date();
    }
    return;
  }

  try {
    await db.update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(eq(conversations.id, id));
  } catch (error) {
    console.warn("[Database] Failed to update conversation title");
    const conv = memoryConversations.get(id);
    if (conv) {
      conv.title = title;
      conv.updatedAt = new Date();
    }
  }
}

export async function deleteConversation(id: number, userId: number) {
  console.log(`[Database] Tentando deletar conversa ${id} para o usuário ${userId}`);
  
  // Sempre tenta remover da memória primeiro para garantir feedback visual
  memoryConversations.delete(id);
  memoryMessages.delete(id);
  saveLocalDb();

  const db = await getDb();
  if (!db) return;

  try {
    // Primeiro deletamos as mensagens (chave estrangeira)
    await db.delete(messages).where(eq(messages.conversationId, id));
    // Depois a conversa, filtrando pelo userId para segurança
    await db.delete(conversations).where(eq(conversations.id, id)).where(eq(conversations.userId, userId));
    console.log(`[Database] Conversa ${id} deletada com sucesso do DB.`);
  } catch (error) {
    console.error("[Database] Erro ao deletar conversa do DB:", error);
  }
}

// ─── Messages ───

export async function getConversationMessages(conversationId: number) {
  const db = await getDb();
  if (!db) {
    return memoryMessages.get(conversationId) || [];
  }

  try {
    return await db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.id);
  } catch (error) {
    console.warn("[Database] Failed to get conversation messages");
    return memoryMessages.get(conversationId) || [];
  }
}

export async function addMessage(conversationId: number, role: string, content: string, fileUrl?: string, fileName?: string) {
  const db = await getDb();
  if (!db) {
    const id = memoryMsgIdCounter++;
    const msg = { id, conversationId, role, content, fileUrl, fileName, createdAt: new Date() };
    if (!memoryMessages.has(conversationId)) {
      memoryMessages.set(conversationId, []);
    }
    memoryMessages.get(conversationId)!.push(msg);
    // Update conversation timestamp
    const conv = memoryConversations.get(conversationId);
    if (conv) conv.updatedAt = new Date();
    saveLocalDb();
    return id;
  }

  try {
    const result = await db.insert(messages).values({ conversationId, role, content, fileUrl, fileName }).returning({ id: messages.id });
    // Update conversation timestamp
    const conv = memoryConversations.get(conversationId);
    if (conv) conv.updatedAt = new Date();
    return result[0].id;
  } catch (error) {
    console.warn("[Database] Failed to add message, using memory fallback");
    const id = memoryMsgIdCounter++;
    const msg = { id, conversationId, role, content, fileUrl, fileName, createdAt: new Date() };
    if (!memoryMessages.has(conversationId)) {
      memoryMessages.set(conversationId, []);
    }
    memoryMessages.get(conversationId)!.push(msg);
    return id;
  }
}
