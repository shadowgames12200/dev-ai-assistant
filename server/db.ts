import { drizzle } from "drizzle-orm/postgres-js";
import postgres from 'postgres';
import * as schema from "../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// Conexão Singleton
let _db: any = null;

export async function getDb() {
  if (!_db) {
    const client = postgres(process.env.DATABASE_URL!);
    _db = drizzle(client, { schema });
  }
  return _db;
}

// ─── Users ───
export async function upsertUser(user: any): Promise<void> {
  const db = await getDb();
  await db.insert(schema.users).values({
    openId: user.openId,
    name: user.name || "",
    email: user.email || "",
    loginMethod: user.loginMethod || "email",
    role: user.role || "user",
    lastSignedIn: new Date(),
  }).onConflictDoUpdate({
    target: schema.users.openId,
    set: {
      name: user.name !== undefined ? user.name : sql`name`,
      email: user.email !== undefined ? user.email : sql`email`,
      lastSignedIn: new Date(),
      role: user.role || sql`role`,
    }
  });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  const results = await db.select().from(schema.users).where(eq(schema.users.openId, openId));
  return results[0] || null;
}

export async function getUserByLoginIdentifier(identifier: string) {
  const db = await getDb();
  const normalized = identifier.trim().toLowerCase();
  const results = await db.select().from(schema.users).where(
    sql`LOWER(email) = ${normalized} OR LOWER(name) = ${normalized}`
  );
  return results[0] || null;
}

export async function createLocalAccount(input: {
  name: string;
  email: string;
  passwordHash: string;
  salt: string;
  role: "admin" | "user";
}) {
  const db = await getDb();
  const normalizedEmail = input.email.trim().toLowerCase();
  const openId = `local:${normalizedEmail}`;
  
  try {
    return await db.transaction(async (tx: any) => {
      await tx.insert(schema.users).values({
        openId,
        name: input.name.trim(),
        email: normalizedEmail,
        loginMethod: "email",
        role: input.role,
      });
      await tx.insert(schema.passwordCredentials).values({
        email: normalizedEmail,
        passwordHash: input.passwordHash,
        salt: input.salt,
      });
      const results = await tx.select().from(schema.users).where(eq(schema.users.openId, openId));
      return results[0] || null;
    });
  } catch (e) {
    return null;
  }
}

export async function updateLocalAccount(input: {
  openId: string;
  name: string;
  email: string;
  passwordHash?: string;
  salt?: string;
}) {
  const db = await getDb();
  const current = await getUserByOpenId(input.openId);
  if (!current) return { status: "not_found" as const, user: null };

  const normalizedEmail = input.email.trim().toLowerCase();
  const nextOpenId = `local:${normalizedEmail}`;

  try {
    return await db.transaction(async (tx: any) => {
      await tx.update(schema.users).set({
        openId: nextOpenId,
        name: input.name.trim(),
        email: normalizedEmail,
      }).where(eq(schema.users.openId, input.openId));

      if (input.passwordHash && input.salt) {
        await tx.insert(schema.passwordCredentials).values({
          email: normalizedEmail,
          passwordHash: input.passwordHash,
          salt: input.salt,
        }).onConflictDoUpdate({
          target: schema.passwordCredentials.email,
          set: {
            passwordHash: input.passwordHash,
            salt: input.salt,
          }
        });
      }
      const updated = await tx.select().from(schema.users).where(eq(schema.users.openId, nextOpenId));
      return { status: "updated" as const, user: updated[0] };
    });
  } catch (e) {
    return { status: "duplicate" as const, user: null };
  }
}

export async function updateUserRole(id: number, role: "admin" | "user") {
  const db = await getDb();
  await db.update(schema.users).set({ role }).where(eq(schema.users.id, id));
  return { id, role };
}

// ─── Conversations ───
export async function createConversation(userId: number, title: string) {
  const db = await getDb();
  const [result] = await db.insert(schema.conversations).values({
    userId,
    title,
  }).returning({ id: schema.conversations.id });
  return result.id;
}

export async function getUserConversations(userId: number) {
  const db = await getDb();
  return await db.select().from(schema.conversations)
    .where(eq(schema.conversations.userId, userId))
    .orderBy(desc(schema.conversations.updatedAt));
}

export async function getConversation(id: number, userId: number) {
  const db = await getDb();
  const results = await db.select().from(schema.conversations)
    .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)));
  return results[0] || null;
}

export async function updateConversationTitle(id: number, title: string) {
  const db = await getDb();
  await db.update(schema.conversations).set({ title }).where(eq(schema.conversations.id, id));
  return { id, title };
}

export async function deleteConversation(id: number, userId: number) {
  const db = await getDb();
  await db.delete(schema.conversations).where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)));
  return true;
}

export async function clearUserConversations(userId: number) {
  const db = await getDb();
  const results = await db.delete(schema.conversations).where(eq(schema.conversations.userId, userId)).returning();
  return results.length;
}

// ─── Messages ───
export async function getConversationMessages(conversationId: number) {
  const db = await getDb();
  return await db.select().from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(schema.messages.id);
}

export async function addMessage(
  conversationId: number,
  role: "user" | "assistant" | "system",
  content: string,
  fileUrl?: string | null,
  fileName?: string | null
) {
  const db = await getDb();
  const [result] = await db.insert(schema.messages).values({
    conversationId,
    role,
    content,
  }).returning({ id: schema.messages.id });
  await db.update(schema.conversations).set({ updatedAt: new Date() }).where(eq(schema.conversations.id, conversationId));
  return result.id;
}

// ─── Attachments ───
export async function addAttachment(attachment: any) {
  const db = await getDb();
  const [result] = await db.insert(schema.attachments).values({
    conversationId: attachment.conversationId,
    userId: attachment.userId,
    fileName: attachment.fileName,
    fileType: attachment.fileType,
    fileSize: attachment.fileSize,
    storageUrl: attachment.storageUrl,
  }).returning({ id: schema.attachments.id });
  return result.id;
}

export async function getConversationAttachments(conversationId: number) {
  const db = await getDb();
  return await db.select().from(schema.attachments)
    .where(eq(schema.attachments.conversationId, conversationId))
    .orderBy(schema.attachments.id);
}

export async function deleteAttachments(ids: number[]) {
  const db = await getDb();
  await db.delete(schema.attachments).where(sql`id = ANY(${ids})`);
  return { success: true };
}

// ─── Pix & Credits ───
export async function createRechargeRequest(input: any) {
  const db = await getDb();
  const id = `pix_${randomUUID()}`;
  const [result] = await db.insert(schema.rechargeRequests).values({
    id,
    userId: input.userId,
    userEmail: input.userEmail,
    packageId: input.packageId,
    amountCents: input.amountCents,
    credits: input.credits,
    status: "pending",
  }).returning();
  return result;
}

export async function listRechargeRequests(status?: any) {
  const db = await getDb();
  let query = db.select().from(schema.rechargeRequests);
  if (status) query = query.where(eq(schema.rechargeRequests.status, status)) as any;
  return await query.orderBy(desc(schema.rechargeRequests.createdAt));
}

export async function approveRechargeRequest(requestId: string, adminUserId: number) {
  const db = await getDb();
  return await db.transaction(async (tx: any) => {
    const [req] = await tx.select().from(schema.rechargeRequests).where(eq(schema.rechargeRequests.id, requestId));
    if (!req || req.status !== "pending") return null;
    
    await tx.update(schema.rechargeRequests).set({
      status: "approved",
      decidedAt: new Date(),
      decidedByUserId: adminUserId,
    }).where(eq(schema.rechargeRequests.id, requestId));
    
    await tx.update(schema.users).set({
      credits: sql`credits + ${req.credits}`
    }).where(eq(schema.users.id, req.userId));
    
    const [updatedReq] = await tx.select().from(schema.rechargeRequests).where(eq(schema.rechargeRequests.id, requestId));
    return updatedReq;
  });
}

// ─── Learning ───
export async function listLearningOpportunities(status?: any) {
  const db = await getDb();
  let query = db.select().from(schema.learningOpportunities);
  if (status) query = query.where(eq(schema.learningOpportunities.status, status)) as any;
  return await query.orderBy(desc(schema.learningOpportunities.createdAt));
}

export async function markLearningOpportunitiesProposed(ids: string[], proposalId: string) {
  const db = await getDb();
  await db.update(schema.learningOpportunities)
    .set({ status: "proposed", proposalId })
    .where(sql`id = ANY(${ids})`);
}

export async function addLearningOpportunity(category: any, reason: string) {
  const db = await getDb();
  const id = `learn_${randomUUID()}`;
  await db.insert(schema.learningOpportunities).values({
    id,
    category,
    reason,
    status: "pending",
  });
}

export async function recordLearningOpportunity(category: any, reason: string) {
  return await addLearningOpportunity(category, reason);
}

export function detectSafeLearningCategory(content: string): "coding" | "productivity" | "general" | null {
  const c = content.toLowerCase();
  if (c.includes("código") || c.includes("programação") || c.includes("bug") || c.includes("erro")) return "coding";
  if (c.includes("produtividade") || c.includes("organizar") || c.includes("planilha")) return "productivity";
  if (c.includes("melhoria") || c.includes("aprender")) return "general";
  return null;
}

export async function updateLearningStatus(id: string, status: any, proposalId?: string) {
  const db = await getDb();
  await db.update(schema.learningOpportunities).set({ status, proposalId }).where(eq(schema.learningOpportunities.id, id));
}

// ─── Extra Helpers ───
export async function getRechargeRequest(id: string) {
  const db = await getDb();
  const results = await db.select().from(schema.rechargeRequests).where(eq(schema.rechargeRequests.id, id));
  return results[0] || null;
}

export async function markRechargeApproved(requestId: string, adminUserId: number) {
  return await approveRechargeRequest(requestId, adminUserId);
}

export async function markRechargeRejected(requestId: string, adminUserId: number) {
  const db = await getDb();
  const [result] = await db.update(schema.rechargeRequests).set({
    status: "rejected",
    decidedAt: new Date(),
    decidedByUserId: adminUserId,
  }).where(eq(schema.rechargeRequests.id, requestId)).returning();
  return result;
}

export async function getUserCredits(userId: number) {
  const db = await getDb();
  const results = await db.select({ credits: schema.users.credits }).from(schema.users).where(eq(schema.users.id, userId));
  return results[0]?.credits || 0;
}

export async function consumeCredits(userId: number, amount: number) {
  const db = await getDb();
  await db.update(schema.users).set({
    credits: sql`GREATEST(0, credits - ${amount})`
  }).where(eq(schema.users.id, userId));
}

export async function addCredits(userId: number, amount: number) {
  const db = await getDb();
  await db.update(schema.users).set({
    credits: sql`credits + ${amount}`
  }).where(eq(schema.users.id, userId));
}

export async function getAllUsers() {
  const db = await getDb();
  return await db.select().from(schema.users).orderBy(desc(schema.users.createdAt));
}

export async function listUserRechargeRequests(userId: number) {
  const db = await getDb();
  return await db.select().from(schema.rechargeRequests)
    .where(eq(schema.rechargeRequests.userId, userId))
    .orderBy(desc(schema.rechargeRequests.createdAt));
}

export async function deleteMessage(id: number) {
  const db = await getDb();
  await db.delete(schema.messages).where(eq(schema.messages.id, id));
  return true;
}

export async function clearConversationMessages(conversationId: number) {
  const db = await getDb();
  await db.delete(schema.messages).where(eq(schema.messages.conversationId, conversationId));
  return true;
}
