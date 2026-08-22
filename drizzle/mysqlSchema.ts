import { mysqlTable, serial, text, varchar, datetime, int, mysqlEnum } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export const roleEnum = mysqlEnum("role", ["user", "admin"]);
export const learningStatusEnum = mysqlEnum("learning_status", ["pending", "proposed", "dismissed"]);
export const rechargeStatusEnum = mysqlEnum("recharge_status", ["pending", "approved", "rejected"]);
export const improvementStatusEnum = mysqlEnum("improvement_status", ["pending", "approved", "rejected", "in-progress", "completed", "failed"]);

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("open_id", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("login_method", { length: 64 }).default("email"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastSignedIn: datetime("last_signed_in").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const passwordCredentials = mysqlTable("password_credentials", {
  email: varchar("email", { length: 320 }).primaryKey(),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const conversations = mysqlTable("conversations", {
  id: serial("id").primaryKey(),
  userId: int("user_id").notNull(),
  title: varchar("title", { length: 256 }).notNull().default("Nova conversa"),
  createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const messages = mysqlTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: int("conversation_id").notNull(),
  role: varchar("role", { length: 32 }).notNull(),
  content: text("content").notNull(),
  metadata: text("metadata"),
  createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const credits = mysqlTable("credits", {
  userId: int("user_id").primaryKey(),
  amount: int("amount").default(0).notNull(),
  updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const recharges = mysqlTable("recharges", {
  id: serial("id").primaryKey(),
  userId: int("user_id").notNull(),
  amount: int("amount").notNull(),
  credits: int("credits").notNull(),
  pixCode: text("pix_code").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const selfImprovements = mysqlTable("self_improvements", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description").notNull(),
  filesToChange: text("files_to_change"),
  risks: text("risks"),
  benefits: text("benefits"),
  estimatedTime: varchar("estimated_time", { length: 64 }),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "in-progress", "completed", "failed"]).default("pending").notNull(),
  result: text("result"),
  createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const learningOpportunities = mysqlTable("learning_opportunities", {
  id: serial("id").primaryKey(),
  category: varchar("category", { length: 64 }).notNull(),
  reason: text("reason").notNull(),
  status: mysqlEnum("status", ["pending", "proposed", "dismissed"]).default("pending").notNull(),
  createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
