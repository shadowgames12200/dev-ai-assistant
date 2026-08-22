import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { ENV } from "./_core/env";

// Singleton Connection
let _dbInstance: any = null;

export async function getDb() {
  if (!_dbInstance) {
    const connectionString = ENV.databaseUrl;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not defined");
    }
    
    const client = postgres(connectionString, {
      prepare: false, // Necessário para Supabase Pooler
    });
    _dbInstance = drizzle(client, { schema });
  }
  return _dbInstance;
}

// ─── Users ───
export async function upsertUser(user: any): Promise<void> {
  const db = await getDb();
  await db.insert(schema.users).values(user).onConflictDoUpdate({
    target: schema.users.openId,
    set: user,
  });
}

export async function getUserByOpenId(openId: string): Promise<any | null> {
  const db = await getDb();
  const results = await db.select().from(schema.users).where(eq(schema.users.openId, openId)).limit(1);
  return results[0] || null;
}

export async function getUserByEmail(email: string): Promise<any | null> {
  const db = await getDb();
  const results = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  return results[0] || null;
}

export async function getUserByLoginIdentifier(identifier: string): Promise<any | null> {
  const db = await getDb();
  const results = await db
    .select()
    .from(schema.users)
    .where(sql`${schema.users.name} = ${identifier} OR ${schema.users.email} = ${identifier}`)
    .limit(1);
  return results[0] || null;
}

export async function getAllUsers(): Promise<any[]> {
  const db = await getDb();
  return await db.select().from(schema.users).orderBy(desc(schema.users.createdAt));
}

// ─── Local Accounts (email/password) ───
export async function createLocalAccount(account: any): Promise<any | null> {
  const db = await getDb();
  const openId = `local:${account.email}`;
  
  try {
    // 1. Create User
    await db.insert(schema.users).values({
      openId,
      name: account.name,
      email: account.email,
      loginMethod: "email",
      role: account.role || "user",
    });

    // 2. Create Credentials
    await db.insert(schema.passwordCredentials).values({
      email: account.email,
      passwordHash: account.passwordHash,
      salt: account.salt,
    });

    return await getUserByOpenId(openId);
  } catch (e) {
    console.error("[DB] Failed to create local account:", e);
    return null;
  }
}

export async function updateLocalAccount(update: any): Promise<{ status: "success" | "duplicate" | "not_found"; user?: any }> {
  const db = await getDb();
  try {
    const userUpdate: any = { name: update.name, email: update.email };
    await db.update(schema.users).set(userUpdate).where(eq(schema.users.openId, update.openId));

    // Se o email mudou, precisamos atualizar a PK na tabela password_credentials
    if (update.oldEmail && update.oldEmail.toLowerCase() !== update.email.toLowerCase()) {
      await db.update(schema.passwordCredentials)
        .set({ email: update.email.toLowerCase() })
        .where(eq(schema.passwordCredentials.email, update.oldEmail.toLowerCase()));
    }

    if (update.passwordHash) {
      await db.update(schema.passwordCredentials).set({
        passwordHash: update.passwordHash,
        salt: update.salt,
      }).where(eq(schema.passwordCredentials.email, update.email.toLowerCase()));
    }

    const user = await getUserByOpenId(update.openId);
    return { status: "success", user };
  } catch (e: any) {
    if (e.code === "23505") return { status: "duplicate" };
    return { status: "not_found" };
  }
}

// ─── Conversations ───
export async function createConversation(userId: number, title: string): Promise<any> {
  const db = await getDb();
  const results = await db.insert(schema.conversations).values({
    userId,
    title,
  }).returning();
  return results[0];
}

export async function getConversations(userId: number): Promise<any[]> {
  const db = await getDb();
  return await db.select().from(schema.conversations).where(eq(schema.conversations.userId, userId)).orderBy(desc(schema.conversations.updatedAt));
}

export async function deleteConversation(id: number, userId: number): Promise<void> {
  const db = await getDb();
  await db.delete(schema.conversations).where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)));
}

export async function clearAllConversations(userId: number): Promise<void> {
  const db = await getDb();
  await db.delete(schema.conversations).where(eq(schema.conversations.userId, userId));
}

// ─── Messages ───
export async function addMessage(conversationId: number, role: string, content: string, metadata?: any): Promise<any> {
  const db = await getDb();
  const results = await db.insert(schema.messages).values({
    conversationId,
    role,
    content,
    metadata: metadata ? JSON.stringify(metadata) : null,
  }).returning();
  
  await db.update(schema.conversations).set({ updatedAt: new Date() }).where(eq(schema.conversations.id, conversationId));
  
  return results[0];
}

export async function getMessages(conversationId: number): Promise<any[]> {
  const db = await getDb();
  return await db.select().from(schema.messages).where(eq(schema.messages.conversationId, conversationId)).orderBy(schema.messages.createdAt);
}

// ─── Credits ───
export async function getUserCredits(userId: number): Promise<number> {
  const db = await getDb();
  const results = await db.select().from(schema.credits).where(eq(schema.credits.userId, userId)).limit(1);
  return results[0]?.amount || 0;
}

export async function consumeCredits(userId: number, amount: number): Promise<boolean> {
  const db = await getDb();
  const user = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (user[0]?.role === "admin") return true;

  const current = await getUserCredits(userId);
  if (current < amount) return false;

  await db.update(schema.credits).set({
    amount: current - amount,
    updatedAt: new Date(),
  }).where(eq(schema.credits.userId, userId));
  
  return true;
}

export async function addCredits(userId: number, amount: number): Promise<void> {
  const db = await getDb();
  const current = await getUserCredits(userId);
  await db.insert(schema.credits).values({
    userId,
    amount: amount,
  }).onConflictDoUpdate({
    target: schema.credits.userId,
    set: { amount: current + amount, updatedAt: new Date() },
  });
}

// ─── Recharge ───
export async function createRechargeRequest(userId: number, amount: number, credits: number, pixCode: string): Promise<any> {
  const db = await getDb();
  const results = await db.insert(schema.recharges).values({
    userId,
    amount,
    credits,
    pixCode,
    status: "pending",
  }).returning();
  return results[0];
}

export async function getPendingRecharges(): Promise<any[]> {
  const db = await getDb();
  return await db.select().from(schema.recharges).where(eq(schema.recharges.status, "pending")).orderBy(desc(schema.recharges.createdAt));
}

export async function approveRecharge(id: number): Promise<void> {
  const db = await getDb();
  const recharge = await db.select().from(schema.recharges).where(eq(schema.recharges.id, id)).limit(1);
  if (!recharge[0] || recharge[0].status !== "pending") return;

  await db.update(schema.recharges).set({ status: "approved", updatedAt: new Date() }).where(eq(schema.recharges.id, id));
  await addCredits(recharge[0].userId, recharge[0].credits);
}

// ─── Self Improvement ───
export async function createImprovementProposal(proposal: any): Promise<any> {
  const db = await getDb();
  const results = await db.insert(schema.selfImprovements).values({
    ...proposal,
    status: "pending",
  }).returning();
  return results[0];
}

export async function getPendingImprovements(): Promise<any[]> {
  const db = await getDb();
  return await db.select().from(schema.selfImprovements).where(eq(schema.selfImprovements.status, "pending")).orderBy(desc(schema.selfImprovements.createdAt));
}

export async function updateImprovementStatus(id: number, status: string, result?: string): Promise<void> {
  const db = await getDb();
  await db.update(schema.selfImprovements).set({
    status: status as any,
    result,
    updatedAt: new Date(),
  }).where(eq(schema.selfImprovements.id, id));
}
