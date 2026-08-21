import { pgTable, serial, text, varchar, timestamp, integer, pgEnum, boolean } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);
export const learningStatusEnum = pgEnum("learning_status", ["pending", "proposed", "dismissed"]);
export const rechargeStatusEnum = pgEnum("recharge_status", ["pending", "approved", "rejected"]);

/**
 * Core user table backing auth flow.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("open_id", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("login_method", { length: 64 }).default("email"),
  role: roleEnum("role").default("user").notNull(),
  credits: integer("credits").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Password credentials for email/password login
 */
export const passwordCredentials = pgTable("password_credentials", {
  email: varchar("email", { length: 320 }).primaryKey(),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Conversations table
 */
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  title: varchar("title", { length: 256 }).notNull().default("Nova conversa"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

/**
 * Messages table
 */
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => conversations.id).notNull(),
  role: varchar("role", { length: 32 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

/**
 * Attachments table
 */
export const attachments = pgTable("attachments", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => conversations.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  fileName: varchar("file_name", { length: 512 }).notNull(),
  fileType: varchar("file_type", { length: 128 }).notNull().default("application/octet-stream"),
  fileSize: integer("file_size").notNull().default(0),
  storageUrl: text("storage_url").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = typeof attachments.$inferInsert;

/**
 * Learning opportunities for self-improvement
 */
export const learningOpportunities = pgTable("learning_opportunities", {
  id: text("id").primaryKey(),
  category: varchar("category", { length: 64 }).notNull(),
  reason: text("reason").notNull(),
  status: learningStatusEnum("status").default("pending").notNull(),
  proposalId: text("proposal_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type LearningOpportunity = typeof learningOpportunities.$inferSelect;

/**
 * Pix recharge requests for credits
 */
export const rechargeRequests = pgTable("recharge_requests", {
  id: text("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  userEmail: varchar("user_email", { length: 320 }).notNull(),
  packageId: varchar("package_id", { length: 64 }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  credits: integer("credits").notNull(),
  status: rechargeStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  decidedAt: timestamp("decided_at"),
  decidedByUserId: integer("decided_by_user_id").references(() => users.id),
});

export type RechargeRequest = typeof rechargeRequests.$inferSelect;
