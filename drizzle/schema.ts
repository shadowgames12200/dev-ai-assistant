import { pgTable, serial, text, varchar, timestamp, integer, pgEnum, boolean } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);
export const learningStatusEnum = pgEnum("learning_status", ["pending", "proposed", "dismissed"]);
export const rechargeStatusEnum = pgEnum("recharge_status", ["pending", "approved", "rejected"]);
export const improvementStatusEnum = pgEnum("improvement_status", ["pending", "approved", "rejected", "in-progress", "completed", "failed"]);

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
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

/**
 * Credits table
 */
export const credits = pgTable("credits", {
  userId: integer("user_id").references(() => users.id).primaryKey(),
  amount: integer("amount").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Recharges table (manual Pix recharge requests)
 */
export const recharges = pgTable("recharges", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  amount: integer("amount").notNull(),
  credits: integer("credits").notNull(),
  pixCode: text("pix_code").notNull(),
  status: rechargeStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Self Improvements table
 */
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

/**
 * Learning opportunities for self-improvement
 */
export const learningOpportunities = pgTable("learning_opportunities", {
  id: serial("id").primaryKey(),
  category: varchar("category", { length: 64 }).notNull(),
  reason: text("reason").notNull(),
  status: learningStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
