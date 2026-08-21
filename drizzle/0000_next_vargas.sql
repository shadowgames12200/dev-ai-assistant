CREATE TYPE "public"."learning_status" AS ENUM('pending', 'proposed', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."recharge_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"file_name" varchar(512) NOT NULL,
	"file_type" varchar(128) DEFAULT 'application/octet-stream' NOT NULL,
	"file_size" integer DEFAULT 0 NOT NULL,
	"storage_url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" varchar(256) DEFAULT 'Nova conversa' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"category" varchar(64) NOT NULL,
	"reason" text NOT NULL,
	"status" "learning_status" DEFAULT 'pending' NOT NULL,
	"proposal_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" varchar(32) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_credentials" (
	"email" varchar(320) PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"salt" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recharge_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"user_email" varchar(320) NOT NULL,
	"package_id" varchar(64) NOT NULL,
	"amount_cents" integer NOT NULL,
	"credits" integer NOT NULL,
	"status" "recharge_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp,
	"decided_by_user_id" integer
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"open_id" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"login_method" varchar(64) DEFAULT 'email',
	"role" "role" DEFAULT 'user' NOT NULL,
	"credits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_signed_in" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_open_id_unique" UNIQUE("open_id")
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recharge_requests" ADD CONSTRAINT "recharge_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recharge_requests" ADD CONSTRAINT "recharge_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;