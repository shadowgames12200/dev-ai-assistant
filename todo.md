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
- [ ] Adaptar código para deploy autônomo no Vercel (vercel.json, env)
- [ ] Enviar código ao GitHub do usuário (shadowgames12200/dev-ai-assistant)

## Qualidade
- [x] Testes vitest para auth e conversas
- [x] Verificação visual das telas (desktop e mobile)
