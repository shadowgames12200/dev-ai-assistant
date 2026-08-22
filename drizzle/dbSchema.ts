import { pgTable, serial as pgSerial, text as pgText, varchar as pgVarchar, timestamp as pgTimestamp, integer as pgInteger, pgEnum } from "drizzle-orm/pg-core";
import { mysqlTable, serial as mysqlSerial, text as mysqlText, varchar as mysqlVarchar, datetime as mysqlDatetime, int as mysqlInt, mysqlEnum } from "drizzle-orm/mysql-core";

const connectionString = process.env.DATABASE_URL || "";
const isPostgres = connectionString.startsWith("postgres");

// Helpers para abstração
const createTable = (name: string, columns: any) => isPostgres ? pgTable(name, columns) : mysqlTable(name, columns);
const serial = (name: string) => isPostgres ? pgSerial(name) : mysqlSerial(name);
const text = (name: string) => isPostgres ? pgText(name) : mysqlText(name);
const varchar = (name: string, opts: { length: number }) => isPostgres ? pgVarchar(name, opts) : mysqlVarchar(name, opts);
const timestamp = (name: string) => isPostgres ? pgTimestamp(name) : mysqlDatetime(name);
const integer = (name: string) => isPostgres ? pgInteger(name) : mysqlInt(name);

export const roleEnum = isPostgres 
  ? pgEnum("role", ["user", "admin"]) 
  : mysqlEnum("role", ["user", "admin"]);

export const learningStatusEnum = isPostgres 
  ? pgEnum("learning_status", ["pending", "proposed", "dismissed"]) 
  : mysqlEnum("learning_status", ["pending", "proposed", "dismissed"]);

export const rechargeStatusEnum = isPostgres 
  ? pgEnum("recharge_status", ["pending", "approved", "rejected"]) 
  : mysqlEnum("recharge_status", ["pending", "approved", "rejected"]);

export const improvementStatusEnum = isPostgres 
  ? pgEnum("improvement_status", ["pending", "approved", "rejected", "in-progress", "completed", "failed"]) 
  : mysqlEnum("improvement_status", ["pending", "approved", "rejected", "in-progress", "completed", "failed"]);

export const users = createTable("users", {
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

export const passwordCredentials = createTable("password_credentials", {
  email: varchar("email", { length: 320 }).primaryKey(),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conversations = createTable("conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: varchar("title", { length: 256 }).notNull().default("Nova conversa"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messages = createTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  role: varchar("role", { length: 32 }).notNull(),
  content: text("content").notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const credits = createTable("credits", {
  userId: integer("user_id").primaryKey(),
  amount: integer("amount").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const recharges = createTable("recharges", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: integer("amount").notNull(),
  credits: integer("credits").notNull(),
  pixCode: text("pix_code").notNull(),
  status: rechargeStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const selfImprovements = createTable("self_improvements", {
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

export const learningOpportunities = createTable("learning_opportunities", {
  id: serial("id").primaryKey(),
  category: varchar("category", { length: 64 }).notNull(),
  reason: text("reason").notNull(),
  status: learningStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
