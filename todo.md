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

## Sistema de créditos (backend — Azure VM)
- [x] Módulo credits.js (ensureTable, getBalance, adjust, grantTrial, addCredits, listUsers) via mysql2 pool.query
- [x] Tabela credits criada no boot (index.js)
- [x] Trial de 50 créditos no auto-cadastro (localAuth.js)
- [x] Router tRPC credits (me, add, list) com gate admin
- [x] Dedução no chat.send: 1 crédito chat / 5 modo agente; admin não paga
- [x] Bloqueio FORBIDDEN quando saldo < custo
- [x] Corrigir bug drizzle.execute com placeholders '?' (credits.js usa pool.query direto)
- [x] Remover opção mysql2 family:4 inválida (db.js)
- [x] Teste e2e: trial, recarga admin, bloqueio e dedução OK

## Sistema de créditos (frontend)
- [ ] Exibir saldo de créditos no chat (badge; admin mostra ilimitado)
- [ ] Painel Admin: coluna de saldo + recarga/remoção de créditos por usuário
- [ ] Mensagem amigável de "créditos esgotados" no chat

## Finalização
- [ ] Verificação final de logs e estabilidade
- [ ] Checkpoint final

## Perguntas do usuário (18/08)
- [ ] Verificar se a auto-melhoria da IA está funcionando na VM
- [ ] Explicar funcionamento híbrido: VM online + LM Studio (Windows 11) local como fallback do LLM

## Correção da auto-melhoria (pedido do usuário 18/08)
- [ ] Criar tabela improvement_proposals (ensureTable no boot do index.js da VM)
- [ ] chat.send: quando intent=improvement, acionar selfImprove.propose automaticamente (proposta real no chat)
- [ ] Registrar rota /approvals no App.tsx + link no painel (Admin ou header)
- [ ] Página Approvals.tsx: integrar com router selfImprove real (list, get, approve com approvalKey do dono, reject)

## Sessão 19/08 — VM (20.89.48.89)
- [x] Página branca corrigida: cache-buster nos assets + nginx gzip/ACAO (porta 80)
- [x] Backend rebuildado com esbuild (vite build causa OOM na VM de 1GB)
- [x] Persistência JSON (credits_data/users_data/convos_data) nos módulos credits, db, chatRouter
- [x] Trial 50 créditos: grantTrial integrado no chat.send para usuários comuns
- [x] Dedução 1 crédito/mensagem validada (usuário teste: 50 → 49)
- [x] Admin unlimited (balance -1)
- [x] admin.listUsers 500 → corrigido com fallback JSON (db.getAllUsers)
- [x] credits.listUsers → corrigido com fallback JSON (merge users+credits_data)
- [x] Self-improvement integrado no chat ("melhore o sistema" → proposta em /approvals)
- [x] Repeats LLM reduzidos 4→2 (rede intermitente da VM)
- [x] Parsing robusto do plano LLM (extração de chunks + regex fallback)
- [x] Ocultar links de Admin/Aprovações no frontend para usuários não-admin
- [ ] Rebuildar frontend (vite) localmente (sandbox) e enviar à VM
- [x] Testar fluxo completo de aprovação com chave
- [ ] Remover usuário de teste e conversas de teste
- [ ] Check final e resumo para o usuário

## Detecção automática de modo agente (pedido 19/08)
- [x] Campo agentMode no input do chat.send (default false)
- [x] LLM leve (gemini-3.6-flash) classifica intenção da mensagem → agentMode automático
- [x] Custo 5 créditos quando agente, com aviso na resposta SSE
- [x] Documentar no frontend (badge mostra quando agente ativo)

## Treinamento de monetização no prompt do sistema (pedido 19/08)
- [x] Prompt do sistema enriquecido: 4 formas de ganhar dinheiro (serviços com IA, marketing/gestão de conteúdo, plataforma com créditos, automações sob demanda)
- [x] Conhecimento embutido: preços realistas em R$, como negociar, formatos de entrega, erros a evitar
- [x] Comportamento: não inventar resultados falsos, ser transparente sobre limites da VM

## Validação E2E pendente (antes do checkpoint)
- [x] Rebuildar e publicar na VM o backend (b8) com credits.remove, setCost/getCost e custo dinâmico
- [x] Testar E2E no painel admin: adicionar créditos, remover créditos e confirmar saldo atualizado
- [x] Testar E2E custo por mensagem: alterar valor no painel e validar débito da próxima mensagem
- [x] Validar com conta não-admin em produção: links Admin e Aprovações ocultos em todos os menus

## Pedidos da sessão 19/08 (tarde)
- [x] Painel admin: adicionar/remover créditos manualmente de qualquer usuário
- [x] Painel admin: alterar o valor configurado por mensagem (crédito por mensagem)
- [x] Tipos TypeScript limpos (self-improvement.ts + db.ts, 0 erros tsc)
- [x] Ocultar links de Admin/Aprovações no frontend para usuários não-admin
- [x] Rebuild final do frontend na VM com patch de ocultação de admin para não-admins
- [x] Timeouts LLM no bundle (b7/b8) — chat SSE OK na VM
- [x] Remover funcionalidade de voz — verificado: nenhum resquício de ElevenLabs no bundle nem no source da VM
- [x] Instalar ferramentas de assembly/máquina (NASM, GCC, gdb, QEMU) na VM e habilitar execução no executor
- [x] Guia de qualidade profissional no SYSTEM_PROMPT para os 3 modelos com auto-revisão (aplicado no source + prompt v2)
- [x] Treinamento de programação completa no SYSTEM_PROMPT (incl. assembly c/ execução NASM/GCC/GDB/QEMU)
- [x] Orientação Workana vs 99Freelas no treinamento da IA (começar pelo Workana, perfil, propostas, precificação)
- [x] Treinar IA no fluxo Opção 3 (divulgar link, auto-cadastro, 50 créditos teste, recarga via admin/Pix)
- [x] Testar end-to-end (chat, créditos, auto-revisão, programação) e limpar dados de teste
- [x] Implementar agentMode real: campo no input de chat.send + classificador LLM leve (gemini-3.6-flash) antes da resposta
- [x] Custo diferenciado: 5 créditos quando agentMode ativo, com aviso via SSE
- [x] Badge/indicador de modo agente no frontend quando ativado
- [x] Completar SYSTEM_PROMPT: garantir 4 modelos de monetização explícitos (freelancer texto, marketing/conteúdo, plataforma créditos, automações sob demanda)
- [x] Validar E2E setCost: custo alterado para 3 e confirmado via getCost; mensagem enviada com sucesso; custo restaurado para 1
- [x] Limpar usuário de teste e conversas de teste dos JSONs da VM
- [x] Push final para GitHub shadowgames12200/dev-ai-assistant (commit f579b2e)
- [x] Resumo final com manual de monetização
- [ ] (Melhoria futura, fora do escopo atual) Pagamento automático: webhook Mercado Pago/Asaas — Pix pago libera créditos automaticamente sem admin manual

## Simulação de serviço freelancer (pedido do usuário 19/08)
- [x] Criar conta de cliente teste na VM (simula cliente real com 50 créditos trial)
- [x] Simular pedido de currículo profissional via chat (pedido típico do Workana)
- [x] Verificar resposta da IA: qualidade, formatação, tempo, débito de créditos
- [x] Entregar resultado da simulação ao usuário
- [x] Limpar conta de teste após simulação

## Qualidade profissional de freelancer (pedido do usuário 19/08)
- [x] Impedir que a IA invente dados pessoais, datas, instituições, experiências, certificados, métricas ou resultados não enviados pelo cliente em currículos (protocolo profissional + bloqueio programático)
- [x] Fazer a IA identificar lacunas e fazer perguntas objetivas antes de fechar currículos
- [x] Adicionar checklist obrigatório de revisão: fatos, ortografia, instruções do cliente, formato e itens pendentes
- [x] Orientar a IA a entregar rascunho seguro com campos [PENDENTE] quando dados essenciais estiverem ausentes
- [x] Testar na VM com pedido de currículo incompleto e publicar a melhoria (bloqueio confirmado E2E)
- [x] Corrigir duplicação de trechos nas respostas em streaming antes de qualquer entrega ao cliente
- [x] Limpar a conversa temporária criada no teste de qualidade da VM
- [x] Usar resposta completa no backend para impedir que eventos SSE incompletos cortem uma entrega profissional
- [x] Bloquear rótulos de entrega final e exigir perguntas quando houver dados essenciais ausentes
- [x] Implementar bloqueio programático para currículo incompleto, impedindo que o modelo gere datas, escola, empresa ou curso não fornecidos
- [x] Implementar guardas programáticas ou pós-validação para transcrição, redação e automação antes de declará-las prontas
- [x] Adicionar testes automatizados de lacunas para transcrição, redação e automação
- [ ] Executar E2E na VM de um caso incompleto de transcrição e de redação ou automação
- [ ] Corrigir o encerramento duplicado de respostas SSE para eliminar erros `write after end` e estabilizar testes de chat

## Perfil freelancer 99Freelas (pedido do usuário 19/08)
- [x] Preencher título, apresentação e experiência com informações profissionais verificáveis
- [x] Selecionar áreas de interesse e habilidades coerentes com os serviços iniciais
- [x] Solicitar confirmação do usuário antes de salvar ou submeter qualquer alteração do perfil

## Pacote completo de treinamento profissional (pedido do usuário 19/08)
- [x] Treinar entendimento de escopo, coleta de requisitos e confirmação de prazo/formato antes de aceitar um trabalho
- [x] Treinar checklists específicos para currículo, transcrição, redação, revisão, tradução, planilha e automação
- [x] Treinar propostas profissionais e atendimento ao cliente para Workana e 99Freelas, sem promessas não confirmadas
- [x] Treinar pesquisa verificável, distinção entre fatos e opinião, e indicação honesta de fontes e incertezas
- [x] Treinar programação segura: diagnóstico, plano, backup, testes, explicação de riscos e nenhum comando destrutivo sem confirmação
- [x] Treinar privacidade, sigilo entre clientes, proteção de credenciais e respeito a direitos autorais
- [x] Treinar eficiência de infraestrutura: estimar complexidade, escolher modo adequado e proteger a VM de tarefas excessivas
- [x] Adicionar protocolo avançado de evidências, critérios de aceitação, confiança e revisão adversarial antes da entrega
- [x] Adicionar ciclo avançado de trabalho: entender, planejar, executar, verificar, revisar riscos e apresentar resultado
- [x] Adicionar classificação explícita de afirmações: dado fornecido, fato verificado, estimativa ou informação pendente
- [x] Adicionar nível de confiança e alternativa segura quando uma resposta depender de informação incompleta ou incerta
- [x] Adicionar revisão adversarial para procurar dados inventados, requisitos esquecidos, contradições, riscos e exposição de dados antes da entrega
- [ ] Testar cenários completos de serviço freelancer na VM, revisar resultados e limpar dados temporários

## Primeiras propostas no 99Freelas (pedido do usuário 19/08)
- [ ] Buscar projetos pequenos de redação, revisão, currículo, transcrição ou planilhas compatíveis com o perfil
- [ ] Avaliar escopo, prazo, orçamento, riscos e consumo de conexões antes de recomendar uma candidatura
- [ ] Preparar proposta personalizada e solicitar confirmação antes de qualquer envio ao cliente

## Execução assistida e aprendizagem por projeto (pedido do usuário 19/08)
- [ ] Criar fluxo de triagem: escopo, requisitos, prazo, formato, riscos e critérios de aceite antes de começar um projeto
- [ ] Criar checklist de produção e revisão final por tipo de serviço, com correções antes da entrega
- [ ] Registrar melhorias aprovadas após cada projeto para que a IA repita o processo em pedidos futuros
- [ ] Exigir confirmação específica do usuário antes de enviar proposta, arquivo, mensagem final ou entregar resultado ao cliente

## Atendimento de projetos na 99Freelas (pedido do usuário 19/08)
- [ ] Monitorar oportunidades compatíveis com currículo, revisão, transcrição, redação e planilhas, preservando conexões para vagas com escopo claro
- [ ] Validar a produção da IA em dados do projeto, corrigir falhas e documentar limitações antes de considerar uma entrega pronta
- [ ] Apresentar ao usuário a proposta e a entrega final completas para confirmação específica antes de qualquer publicação, envio ou aceite ao cliente
