import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
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

export async function getUserById(userId: number): Promise<any | null> {
  const db = await getDb();
  const results = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return results[0] || null;
}

export async function updateUserRole(userId: number, role: "user" | "admin"): Promise<any | null> {
  const db = await getDb();
  const results = await db
    .update(schema.users)
    .set({ role, updatedAt: new Date() })
    .where(eq(schema.users.id, userId))
    .returning();
  return results[0] || null;
}

/** Remove uma conta e seus dados dependentes sem tocar em outras contas. */
export async function deleteUserAccount(userId: number): Promise<boolean> {
  const db = await getDb();
  const target = await getUserById(userId);
  if (!target) return false;

  await db.transaction(async (tx: any) => {
    const userConversations = await tx
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(eq(schema.conversations.userId, userId));

    for (const conversation of userConversations) {
      await tx.delete(schema.messages).where(eq(schema.messages.conversationId, conversation.id));
    }

    await tx.delete(schema.conversationShares).where(eq(schema.conversationShares.userId, userId));
    await tx.delete(schema.conversations).where(eq(schema.conversations.userId, userId));
    await tx.delete(schema.credits).where(eq(schema.credits.userId, userId));
    await tx.delete(schema.recharges).where(eq(schema.recharges.userId, userId));
    await tx.delete(schema.abuseCases).where(eq(schema.abuseCases.userId, userId));

    if (target.email) {
      await tx.delete(schema.passwordCredentials).where(eq(schema.passwordCredentials.email, String(target.email).toLowerCase()));
    }

    await tx.delete(schema.users).where(eq(schema.users.id, userId));
  });

  return true;
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

export async function createAbuseCase(input: {
  userId: number;
  score: number;
  signals: string[];
  temporaryUntil?: Date | null;
  status?: "open" | "confirmed" | "dismissed" | "resolved";
}): Promise<any> {
  const db = await getDb();
  const [created] = await db.insert(schema.abuseCases).values({
    userId: input.userId,
    score: input.score,
    signals: JSON.stringify(input.signals),
    temporaryUntil: input.temporaryUntil ?? null,
    status: input.status ?? "open",
  }).returning();
  return created;
}

export async function temporarilyBlockUser(userId: number, until: Date, reason: string, score: number, signals: string[]): Promise<any> {
  const db = await getDb();
  const [user] = await db.update(schema.users)
    .set({ accountStatus: "temporarily_blocked", blockedUntil: until, blockedReason: reason, updatedAt: new Date() })
    .where(eq(schema.users.id, userId))
    .returning();
  if (!user) return null;
  await createAbuseCase({ userId, score, signals, temporaryUntil: until });
  return user;
}

export async function permanentlyBlockUser(userId: number, reason: string, reviewedByUserId: number): Promise<any> {
  const db = await getDb();
  const [user] = await db.update(schema.users)
    .set({ accountStatus: "blocked", blockedUntil: null, blockedReason: reason, updatedAt: new Date() })
    .where(eq(schema.users.id, userId))
    .returning();
  if (!user) return null;
  await createAbuseCase({ userId, score: 100, signals: ["manual_permanent_block"], status: "confirmed" });
  const [review] = await db.select().from(schema.abuseCases)
    .where(and(eq(schema.abuseCases.userId, userId), eq(schema.abuseCases.status, "confirmed")))
    .orderBy(desc(schema.abuseCases.createdAt)).limit(1);
  if (review) {
    await db.update(schema.abuseCases).set({ reviewedByUserId, reviewedAt: new Date(), reviewNote: reason }).where(eq(schema.abuseCases.id, review.id));
  }
  return user;
}

export async function clearUserBlock(userId: number, reviewedByUserId: number, note?: string): Promise<any> {
  const db = await getDb();
  const [user] = await db.update(schema.users)
    .set({ accountStatus: "active", blockedUntil: null, blockedReason: null, updatedAt: new Date() })
    .where(eq(schema.users.id, userId))
    .returning();
  if (!user) return null;
  await db.update(schema.abuseCases).set({ status: "resolved", reviewedByUserId, reviewedAt: new Date(), reviewNote: note ?? null })
    .where(and(eq(schema.abuseCases.userId, userId), eq(schema.abuseCases.status, "open")));
  return user;
}

export async function getAbuseCases(): Promise<any[]> {
  const db = await getDb();
  const cases = await db.select().from(schema.abuseCases).orderBy(desc(schema.abuseCases.createdAt));
  const results = [];
  for (const abuseCase of cases) {
    const user = await getUserById(abuseCase.userId);
    results.push({ ...abuseCase, userEmail: user?.email ?? null, userName: user?.name ?? null, accountStatus: user?.accountStatus ?? null });
  }
  return results;
}

// ─── Local Accounts (email/password) ───
export async function createLocalAccount(account: any): Promise<any | null> {
  const db = await getDb();
  const openId = `local:${account.email}`;
  const initialCredits = Number(account.initialCredits);

  try {
    return await db.transaction(async (tx: any) => {
      const [user] = await tx.insert(schema.users).values({
        openId,
        name: account.name,
        email: account.email,
        loginMethod: "email",
        role: account.role || "user",
      }).returning();

      if (!user) return null;

      await tx.insert(schema.passwordCredentials).values({
        email: account.email,
        passwordHash: account.passwordHash,
        salt: account.salt,
      });

      if (Number.isInteger(initialCredits) && initialCredits > 0) {
        await tx.insert(schema.credits).values({
          userId: user.id,
          amount: initialCredits,
        });
      }

      return user;
    });
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

/** Returns a conversation only when it belongs to the authenticated user. */
export async function getConversationForUser(id: number, userId: number): Promise<any | null> {
  const db = await getDb();
  const results = await db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)))
    .limit(1);
  return results[0] || null;
}

export async function deleteConversation(id: number, userId: number): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx: any) => {
    await tx.delete(schema.conversationShares).where(and(eq(schema.conversationShares.conversationId, id), eq(schema.conversationShares.userId, userId)));
    await tx.delete(schema.conversations).where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)));
  });
}

export async function clearAllConversations(userId: number): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx: any) => {
    const userConversations = await tx.select({ id: schema.conversations.id }).from(schema.conversations).where(eq(schema.conversations.userId, userId));
    for (const conversation of userConversations) {
      await tx.delete(schema.conversationShares).where(eq(schema.conversationShares.conversationId, conversation.id));
    }
    await tx.delete(schema.conversations).where(eq(schema.conversations.userId, userId));
  });
}

export async function createOrUpdateConversationShare(
  conversationId: number,
  userId: number,
  visibility: "private" | "public",
): Promise<any> {
  const db = await getDb();
  const conversation = await getConversationForUser(conversationId, userId);
  if (!conversation) return null;

  const existing = await db.select().from(schema.conversationShares)
    .where(and(eq(schema.conversationShares.conversationId, conversationId), eq(schema.conversationShares.userId, userId)))
    .limit(1);

  if (existing[0]) {
    const [updated] = await db.update(schema.conversationShares)
      .set({ visibility, updatedAt: new Date(), revokedAt: null })
      .where(eq(schema.conversationShares.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(schema.conversationShares).values({
    conversationId,
    userId,
    token: randomUUID().replaceAll("-", ""),
    visibility,
  }).returning();
  return created;
}

export async function getPublicConversationShare(token: string): Promise<{ share: any; conversation: any; messages: any[] } | null> {
  const db = await getDb();
  const [share] = await db.select().from(schema.conversationShares)
    .where(and(eq(schema.conversationShares.token, token), eq(schema.conversationShares.visibility, "public"), sql`${schema.conversationShares.revokedAt} IS NULL`))
    .limit(1);
  if (!share) return null;

  const [conversation] = await db.select().from(schema.conversations)
    .where(eq(schema.conversations.id, share.conversationId)).limit(1);
  if (!conversation) return null;

  const sharedMessages = await db.select().from(schema.messages)
    .where(eq(schema.messages.conversationId, share.conversationId))
    .orderBy(schema.messages.createdAt);
  return { share, conversation, messages: sharedMessages };
}

// ─── Messages ───
export async function addMessage(conversationId: number, userId: number, role: string, content: string, metadata?: any): Promise<any> {
  const conversation = await getConversationForUser(conversationId, userId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const db = await getDb();
  const results = await db.insert(schema.messages).values({
    conversationId,
    role,
    content,
    metadata: metadata ? JSON.stringify(metadata) : null,
  }).returning();
  
  await db
    .update(schema.conversations)
    .set({ updatedAt: new Date() })
    .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.userId, userId)));
  
  return results[0];
}

export async function getMessages(conversationId: number, userId: number): Promise<any[]> {
  const conversation = await getConversationForUser(conversationId, userId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }

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
