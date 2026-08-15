# DevAI Assistant — TODO

## Autenticação
- [x] Login por e-mail/senha com auto-cadastro automático de novos usuários
- [x] Admin definido pelo e-mail do dono (OWNER_OPEN_ID / email do owner)
- [x] Logout funcional
- [x] Rota protegida: redirecionar não autenticados para a tela de login

## Banco de dados
- [x] Tabela users (com papel admin/user, email, loginMethod)
- [x] Tabela conversations (por usuário, título)
- [x] Tabela messages (por conversa, papel user/assistant, conteúdo, timestamps)
- [x] Tabela attachments (arquivos enviados: nome, tipo, URL S3, vínculo com conversa)
- [x] Helpers de banco em server/db.ts

## Chat e IA
- [x] Integração LLM para respostas de programação e produtividade (prompt do sistema definido)
- [x] Streaming de respostas da IA em tempo real no chat
- [x] Histórico de mensagens persistido por conversa e usuário
- [x] Criação, renomeação e exclusão de conversas
- [x] Lista de conversas no painel lateral

## Painel e layout
- [x] Layout dashboard com painel lateral (sidebar) para navegação
- [x] Tela de login (mesmo estilo do site original: fundo escuro, card central)
- [x] Página principal com chat e sidebar de conversas

## Upload e análise de arquivos
- [x] Upload de arquivos para S3 com persistência de metadados
- [x] Upload e análise de imagens, textos e ZIPs, com extração de conteúdo
- [x] Envio do conteúdo extraído ao contexto do chat

## Controle de acesso
- [x] Controle por papel (admin vs user) com rotas protegidas
- [x] Painel de admin básico (gestão de usuários) visível apenas para admin

## Entrega
- [x] Deploy autônomo decidido por mudança de arquitetura: app agora roda fullstack na Azure VM (20.89.48.89) — não mais na Vercel
- [x] Código versionado no GitHub (shadowgames12200/dev-ai-assistant) — repo usado para migrar o backend para a VM

## Migração para Azure VM (20.89.48.89)
- [x] Fullstack React/Express/tRPC migrado para a VM (PM2, Nginx, MySQL/TiDB)
- [x] Login e-mail/senha corrigido e funcionando (charleshenriquegonsalves05@gmail.com)
- [x] Executor sandbox em Docker isolado (porta 8443) para capacidades autônomas (Python/Node/Bash)
- [x] Correção de bug crítico: 'iteration is not defined' no loop do agente
- [x] Upload e análise universal de arquivos Office (xlsx, docx, pptx) com extração real de conteúdo
- [x] Fallback de LLM: Forge/Groq → Gemini (gemini-3.1-flash-lite) → Ollama local (desativado por padrão, RAM da VM insuficiente)
- [x] Timeouts e AbortController em todos os fetches de LLM para evitar travamentos
- [x] Correção de recursão infinita no fallback (flag __noFallback)
- [x] Módulo de memória semântica degrada graciosamente (Forge não suporta embeddings)
- [x] Verificação completa sem bugs: sintaxe, tRPC, executor, frontend, banco

## Qualidade
- [x] Testes vitest para auth e conversas
- [x] Verificação visual das telas (desktop e mobile)
- [x] Teste end-to-end do fallback Gemini forçado (Groq simulado falho)
