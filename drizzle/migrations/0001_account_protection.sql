DO $$ BEGIN
  CREATE TYPE "public"."account_status" AS ENUM('active', 'temporarily_blocked', 'blocked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."abuse_case_status" AS ENUM('open', 'confirmed', 'dismissed', 'resolved');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "account_status" "account_status" DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "blocked_until" timestamp;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "blocked_reason" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "abuse_cases" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "status" "abuse_case_status" DEFAULT 'open' NOT NULL,
  "score" integer NOT NULL,
  "signals" text NOT NULL,
  "temporary_until" timestamp,
  "review_note" text,
  "reviewed_by_user_id" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "reviewed_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "abuse_cases_user_id_idx" ON "abuse_cases" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "abuse_cases_status_idx" ON "abuse_cases" USING btree ("status");
