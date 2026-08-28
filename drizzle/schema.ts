import { pgTable, serial, text, varchar, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);
export const learningStatusEnum = pgEnum("learning_status", ["pending", "proposed", "dismissed"]);
export const rechargeStatusEnum = pgEnum("recharge_status", ["pending", "approved", "rejected"]);
export const improvementStatusEnum = pgEnum("improvement_status", ["pending", "approved", "rejected", "in-progress", "completed", "failed"]);
export const accountStatusEnum = pgEnum("account_status", ["active", "temporarily_blocked", "blocked"]);
export const abuseCaseStatusEnum = pgEnum("abuse_case_status", ["open", "confirmed", "dismissed", "resolved"]);
export const shareVisibilityEnum = pgEnum("share_visibility", ["private", "public"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("open_id", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("login_method", { length: 64 }).default("email"),
  role: roleEnum("role").default("user").notNull(),
  accountStatus: accountStatusEnum("account_status").default("active").notNull(),
  blockedUntil: timestamp("blocked_until"),
  blockedReason: text("blocked_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const passwordCredentials = pgTable("password_credentials", {
  email: varchar("email", { length: 320 }).primaryKey(),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: varchar("title", { length: 256 }).notNull().default("Nova conversa"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

export const conversationShares = pgTable("conversation_shares", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  userId: integer("user_id").notNull(),
  token: varchar("token", { length: 96 }).notNull().unique(),
  visibility: shareVisibilityEnum("visibility").default("private").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
});

export type ConversationShare = typeof conversationShares.$inferSelect;
export type InsertConversationShare = typeof conversationShares.$inferInsert;

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  role: varchar("role", { length: 32 }).notNull(),
  content: text("content").notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

export const credits = pgTable("credits", {
  userId: integer("user_id").primaryKey(),
  amount: integer("amount").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const recharges = pgTable("recharges", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: integer("amount").notNull(),
  credits: integer("credits").notNull(),
  pixCode: text("pix_code").notNull(),
  status: rechargeStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const selfImprovements = pgTable("self_improvements", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description").notNull(),
  filesToChange: text("files_to_change"),
  risks: text("risks"),
  benefits: text("benefits"),
  estimatedTime: varchar("estimated_time", { length: 64 }),
  status: improvementStatusEnum("status").default("pending").notNull(),
  result: text("result"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const learningOpportunities = pgTable("learning_opportunities", {
  id: serial("id").primaryKey(),
  category: varchar("category", { length: 64 }).notNull(),
  reason: text("reason").notNull(),
  status: learningStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const abuseCases = pgTable("abuse_cases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  status: abuseCaseStatusEnum("status").default("open").notNull(),
  score: integer("score").notNull(),
  signals: text("signals").notNull(),
  temporaryUntil: timestamp("temporary_until"),
  reviewNote: text("review_note"),
  reviewedByUserId: integer("reviewed_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
});
