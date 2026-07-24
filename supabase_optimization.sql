-- 1. MELHORIA DE PERFORMANCE: Migração para HNSW no pgvector
-- HNSW oferece buscas até 3x mais rápidas que IVFFlat

-- Remove o índice antigo se existir (ajuste o nome se necessário)
DROP INDEX IF EXISTS ai_memories_embedding_idx;

-- Cria o novo índice HNSW
CREATE INDEX ON ai_memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);


-- 2. SEGURANÇA: Habilitar Row Level Security (RLS)
-- Garante que um usuário não consiga ver os dados de outro

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_memories ENABLE ROW LEVEL SECURITY;

-- 3. POLÍTICAS DE ACESSO (POLICIES)

-- Usuários: Apenas o próprio perfil
-- Nota: O app usa autenticação customizada que mapeia para users."openId"
-- Se estiver usando Supabase Auth, auth.uid() retornará o UUID do usuário.

CREATE POLICY "Users can view their own profile" ON users
  FOR SELECT USING (auth.uid()::text = "openId");

CREATE POLICY "Users can update their own profile" ON users
  FOR UPDATE USING (auth.uid()::text = "openId");

-- Conversas: Apenas as próprias conversas
CREATE POLICY "Users can manage their own conversations" ON conversations
  FOR ALL USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = conversations."userId" 
    AND users."openId" = auth.uid()::text
  ));

-- Mensagens: Apenas mensagens de suas próprias conversas
CREATE POLICY "Users can manage their own messages" ON messages
  FOR ALL USING (EXISTS (
    SELECT 1 FROM conversations 
    JOIN users ON users.id = conversations."userId"
    WHERE conversations.id = messages."conversationId" 
    AND users."openId" = auth.uid()::text
  ));

-- Memórias: Apenas as próprias memórias
CREATE POLICY "Users can manage their own AI memories" ON ai_memories
  FOR ALL USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = ai_memories.user_id 
    AND users."openId" = auth.uid()::text
  ));
