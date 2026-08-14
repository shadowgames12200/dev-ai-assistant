import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertAttachment,
  InsertConversation,
  InsertMessage,
  InsertUser,
  attachments,
  conversations,
  messages,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ───

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    for (const field of ["name", "email", "loginMethod"] as const) {
      const value = user[field];
      if (value !== undefined) {
        values[field] = value ?? null;
        updateSet[field] = value ?? null;
      }
    }

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    const isOwnerByOpenId = user.openId === ENV.ownerOpenId;
    const ownerEmail = process.env.OWNER_EMAIL ?? "";
    const isOwnerByEmail =
      ownerEmail !== "" &&
      (user.email?.toLowerCase() ?? "") === ownerEmail.toLowerCase();
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (isOwnerByOpenId || isOwnerByEmail) {
      // First owner / predefined owner should always be admin, even on
      // re-sync updates that do not carry a role explicitly.
      values.role = "admin";
      updateSet.role = "admin";
    } else {
      // Only set role on INSERT (upsert without role must never downgrade an
      // existing user — e.g. a promoted admin — back to "user").
      values.role = "user";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserRole(id: number, role: "admin" | "user") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role }).where(eq(users.id, id));
}

// ─── Conversations ───

export async function createConversation(userId: number, title: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .insert(conversations)
    .values({ userId, title })
    .$returningId();
  return result[0].id;
}

export async function getUserConversations(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt));
}

export async function getConversation(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  const conv = result[0];
  if (conv && conv.userId !== userId) return undefined;
  return conv;
}

export async function updateConversationTitle(id: number, title: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(conversations).set({ title }).where(eq(conversations.id, id));
}

export async function deleteConversation(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(messages).where(eq(messages.conversationId, id));
  await db.delete(attachments).where(eq(attachments.conversationId, id));
  await db
    .delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
}

// ─── Messages ───

export async function getConversationMessages(conversationId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.id));
}

export async function addMessage(
  conversationId: number,
  role: string,
  content: string,
  fileUrl?: string,
  fileName?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .insert(messages)
    .values({ conversationId, role, content, fileUrl, fileName })
    .$returningId();
  return result[0].id;
}

// ─── Attachments ───

export async function addAttachment(attachment: InsertAttachment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(attachments).values(attachment).$returningId();
  return result[0].id;
}

export async function getConversationAttachments(conversationId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(attachments)
    .where(eq(attachments.conversationId, conversationId))
    .orderBy(asc(attachments.id));
}

export async function deleteAttachments(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  await db.delete(attachments).where(inArray(attachments.id, ids));
}

