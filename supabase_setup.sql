-- Habilitar a extensão pgvector para busca semântica
create extension if not exists vector;

-- Tabela para armazenar memórias e conhecimentos da IA
create table if not exists ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null,
  content text not null,
  metadata jsonb default '{}'::jsonb,
  embedding vector(1536), -- 1536 é o tamanho padrão dos embeddings do OpenAI (text-embedding-3-small)
  created_at timestamp with time zone default now()
);

-- Índice para busca rápida por similaridade
create index on ai_memories using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Função para busca por similaridade (RPC)
create or replace function match_memories (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id bigint
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    ai_memories.id,
    ai_memories.content,
    ai_memories.metadata,
    1 - (ai_memories.embedding <=> query_embedding) as similarity
  from ai_memories
  where 1 - (ai_memories.embedding <=> query_embedding) > match_threshold
    and ai_memories.user_id = p_user_id
  order by ai_memories.embedding <=> query_embedding
  limit match_count;
end;
$$;
