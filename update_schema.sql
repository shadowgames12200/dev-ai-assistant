-- Enums
DO $$ BEGIN
    CREATE TYPE "role" AS ENUM('user', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "learning_status" AS ENUM('pending', 'proposed', 'dismissed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "recharge_status" AS ENUM('pending', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "improvement_status" AS ENUM('pending', 'approved', 'rejected', 'in-progress', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Tabela de Usuários (Ajuste se necessário)
CREATE TABLE IF NOT EXISTS "users" (
    "id" SERIAL PRIMARY KEY,
    "open_id" VARCHAR(64) NOT NULL UNIQUE,
    "name" TEXT,
    "email" VARCHAR(320),
    "login_method" VARCHAR(64) DEFAULT 'email',
    "role" "role" DEFAULT 'user' NOT NULL,
    "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
    "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL,
    "last_signed_in" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Tabela de Credenciais
CREATE TABLE IF NOT EXISTS "password_credentials" (
    "email" VARCHAR(320) PRIMARY KEY,
    "password_hash" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Tabela de Conversas
CREATE TABLE IF NOT EXISTS "conversations" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER REFERENCES "users"("id") NOT NULL,
    "title" VARCHAR(256) DEFAULT 'Nova conversa' NOT NULL,
    "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
    "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Tabela de Compartilhamentos
DO $$ BEGIN
    CREATE TYPE "share_visibility" AS ENUM('private', 'public');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "conversation_shares" (
    "id" SERIAL PRIMARY KEY,
    "conversation_id" INTEGER REFERENCES "conversations"("id") NOT NULL,
    "user_id" INTEGER REFERENCES "users"("id") NOT NULL,
    "token" VARCHAR(96) NOT NULL UNIQUE,
    "visibility" "share_visibility" DEFAULT 'private' NOT NULL,
    "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
    "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL,
    "revoked_at" TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "conversation_shares_token_idx" ON "conversation_shares" ("token");

-- Tabela de Mensagens
CREATE TABLE IF NOT EXISTS "messages" (
    "id" SERIAL PRIMARY KEY,
    "conversation_id" INTEGER REFERENCES "conversations"("id") NOT NULL,
    "role" VARCHAR(32) NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" TEXT,
    "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Tabela de Créditos
CREATE TABLE IF NOT EXISTS "credits" (
    "user_id" INTEGER REFERENCES "users"("id") PRIMARY KEY,
    "amount" INTEGER DEFAULT 0 NOT NULL,
    "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Tabela de Recargas
CREATE TABLE IF NOT EXISTS "recharges" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER REFERENCES "users"("id") NOT NULL,
    "amount" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL,
    "pix_code" TEXT NOT NULL,
    "status" "recharge_status" DEFAULT 'pending' NOT NULL,
    "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
    "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Tabela de Auto-Melhorias
CREATE TABLE IF NOT EXISTS "self_improvements" (
    "id" SERIAL PRIMARY KEY,
    "title" VARCHAR(256) NOT NULL,
    "description" TEXT NOT NULL,
    "files_to_change" TEXT,
    "risks" TEXT,
    "benefits" TEXT,
    "estimated_time" VARCHAR(64),
    "status" "improvement_status" DEFAULT 'pending' NOT NULL,
    "result" TEXT,
    "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
    "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Tabela de Oportunidades de Aprendizado
CREATE TABLE IF NOT EXISTS "learning_opportunities" (
    "id" SERIAL PRIMARY KEY,
    "category" VARCHAR(64) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "learning_status" DEFAULT 'pending' NOT NULL,
    "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);
