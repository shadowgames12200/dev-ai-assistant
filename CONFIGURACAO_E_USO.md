# DevAI Assistant - Guia de Configuração e Uso das Novas Funcionalidades

Este documento detalha como configurar e utilizar as melhorias avançadas implementadas no seu DevAI Assistant, incluindo Memória Semântica (Supabase Vector), Sandbox Docker, Sistema de Ferramentas expandido e Multimodalidade.

## 1. Configuração do Ambiente (VM Azure)

Para que todas as novas funcionalidades operem corretamente, sua VM na Azure precisa estar configurada da seguinte forma:

### 1.1. Instalação do Docker
O Sandbox de Execução de Código utiliza Docker para isolar e proteger seu ambiente. Certifique-se de que o Docker esteja instalado na sua VM Azure.

```bash
sudo apt update
sudo apt install docker.io -y
sudo systemctl start docker
sudo systemctl enable docker
# Opcional: Adicionar seu usuário ao grupo docker para não precisar de sudo
sudo usermod -aG docker $USER
# Reinicie a sessão SSH ou a VM para que a mudança tenha efeito
```

### 1.2. Variáveis de Ambiente
Atualize o arquivo `.env` na raiz do seu projeto com as seguintes variáveis. Estas chaves são essenciais para a IA acessar APIs externas e operar com segurança.

```env
# Token GitHub para auto-melhoria e acesso ao repositório
# GITHUB_TOKEN=ghp_SEU_TOKEN_GITHUB_AQUI

# Chave secreta para aprovar propostas de auto-melhoria da IA
# APPROVAL_KEY=SUA_CHAVE_SECRETA_DE_APROVACAO_AQUI

# Chave da API Groq para o modelo de linguagem principal
# GROQ_API_KEY=gsk_SEU_GROQ_API_KEY_AQUI

# Chave da API OpenAI (ou Forge) para Embeddings e Multimodalidade (Visão/Geração de Imagens)
# OPENAI_API_KEY=sk-SEU_OPENAI_API_KEY_AQUI
# ou
# FORGE_API_KEY=sk-SEU_FORGE_API_KEY_AQUI
# FORGE_API_URL=https://forge.manus.im/v1 (se estiver usando Forge)

# URL e Chave Anon do Supabase (já devem estar configuradas)
# SUPABASE_URL=https://xyz.supabase.co
# SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1Ni...
```

**Importante**: Após adicionar ou modificar as variáveis de ambiente, você deve **reiniciar o servidor** do DevAI Assistant para que as mudanças sejam carregadas.

## 2. Configuração do Supabase (Memória Semântica)

A Memória Semântica utiliza a extensão `pgvector` do PostgreSQL no Supabase para armazenar e buscar memórias de longo prazo por similaridade.

### 2.1. Habilitar `pgvector` e Criar Tabelas
1.  Acesse o painel do seu projeto Supabase.
2.  Vá em **Database > Extensions**.
3.  Procure por `pgvector` e **habilite-o**.
4.  Vá em **SQL Editor** e execute o script `supabase_setup.sql` que foi adicionado ao seu repositório:

    ```sql
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
    ```

## 3. Uso das Novas Funcionalidades

### 3.1. Memória Semântica (Longo Prazo)
-   **Uso Automático**: A IA agora extrai automaticamente fatos importantes das suas conversas e os armazena na memória semântica. Em conversas futuras, ela buscará essas memórias para fornecer respostas mais contextuais e personalizadas.
-   **Ferramenta `save_fact`**: Você pode instruir a IA a "salvar um fato" explicitamente. Exemplo: "Lembre-se que meu projeto principal é um e-commerce de eletrônicos chamado 'TechShop'". A IA usará a ferramenta `save_fact` para registrar isso.
-   **Ferramenta `search_memories`**: A IA usará esta ferramenta internamente quando precisar buscar informações passadas relevantes para sua pergunta.

### 3.2. Sandbox de Execução de Código
-   **`execute_js` e `execute_python`**: A IA agora pode executar código JavaScript e Python em um ambiente Docker seguro. Se você pedir para ela "escrever um script Python para calcular a sequência de Fibonacci" e depois "rodar esse script com o número 10", ela usará a ferramenta `execute_python` para isso.
-   **Segurança**: O código é executado em um container isolado, com limites de tempo, CPU e memória, protegendo sua VM.

### 3.3. Multimodalidade (Visão e Geração de Imagens)
-   **`generate_image`**: Você pode pedir para a IA gerar imagens. Exemplo: "Gere uma imagem de um robô programando em um computador futurista, em estilo cyberpunk". A IA usará a ferramenta `generate_image` e retornará a URL da imagem.
-   **Análise de Imagens**: Ao fazer upload de uma imagem, a IA pode usar modelos de visão (via `OPENAI_API_KEY` ou `FORGE_API_KEY`) para descrever o conteúdo, identificar elementos, ou até mesmo analisar diagramas e código em capturas de tela.

### 3.4. Sistema de Ferramentas Expandido
As ferramentas `web_search`, `execute_js`, `execute_python`, `search_memories`, `save_fact` e `generate_image` estão agora disponíveis para a IA usar de forma autônoma, tanto no modo de chat normal quanto no modo agente. A IA decidirá qual ferramenta usar com base na sua solicitação.

## 4. Próximos Passos

Com essas configurações, seu DevAI Assistant estará muito mais robusto e inteligente. Recomendo testar as novas funcionalidades e observar como a IA se adapta e utiliza as ferramentas para resolver suas tarefas.

---
*Documento gerado por Manus AI*
