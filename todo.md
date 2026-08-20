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
- [x] Exibir saldo de créditos no chat (badge; admin mostra ilimitado)
- [x] Painel Admin: coluna de saldo + recarga/remoção de créditos por usuário
- [x] Mensagem amigável de "créditos esgotados" no chat
- [x] Mapear os componentes e procedimentos existentes antes de alterar a interface de créditos
- [x] Adicionar testes de interface/contrato para saldo, administração e bloqueio por créditos esgotados
- [x] Adicionar evidência verificável da coluna de saldo e dos controles de recarga/remoção no painel administrativo
- [x] Criar teste para o contrato de bloqueio de créditos com creditBlocked, balance e requiredCredits
- [x] Criar testes de interface que cubram o chat sem crédito e o painel administrativo com saldo por usuário
- [x] Criar teste real de interface para o ChatView com aviso, campo e botão bloqueados sem créditos
- [x] Criar teste real de interface para o Admin com saldo por usuário e botões de adicionar/remover créditos
- [x] Substituir as inspeções estáticas de fonte por cobertura de integração/UI baseada em renderização

## Publicação da interface de créditos (20/08)
- [x] Compilar o cliente e o backend com a experiência de créditos atualizada
- [x] Publicar os arquivos estáticos e o backend compilado na VM Azure
- [x] Reiniciar o processo gerenciado e confirmar estado online, ativos publicados e resposta HTTP local

## Sincronização do GitHub (20/08)
- [x] Verificar divergências do repositório local e remoto e excluir dados de runtime do commit
- [ ] Criar commit limpo da interface de créditos e testes validados
- [ ] Enviar a versão ao GitHub e confirmar que a branch remota está atualizada
- [x] Remover do versionamento os JSONs de runtime e o bundle compilado, preservando os arquivos locais e da VM
- [x] Confirmar que o repositório pode ser reconstruído somente a partir do código-fonte antes do envio ao GitHub

## Finalização
- [ ] Verificação final de logs e estabilidade
- [ ] Checkpoint final

## Auditoria de pendências técnicas (20/08)
- [x] Verificar no código e na VM se o fluxo de autoaperfeiçoamento com aprovação do dono permanece funcional
- [x] Concluir auditoria documentada das pendências antigas de qualidade, testes e publicação, identificando o que já foi coberto e o que permanece aberto
- [x] Registrar explicitamente a inexistência de correção técnica confirmada nesta auditoria, se essa conclusão permanecer após a revisão completa
- [ ] Salvar o registro final da auditoria e criar um checkpoint específico depois de concluir a revisão documentada
- [x] Mapear item a item as pendências antigas relevantes como cobertas, pendentes ou fora de escopo
- [x] Acrescentar uma seção de publicação e implantação, separando a VM ativa, a validação local e itens ainda não revalidados
- [ ] Confirmar no histórico que o checkpoint salvo corresponde à auditoria técnica e à ausência de correção necessária nesta rodada

## Perguntas do usuário (18/08)
- [x] Verificar se a auto-melhoria da IA está funcionando na VM
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
- [x] Retomar a busca recente por oportunidades de texto, transcrição e planilhas sem enviar propostas nem consumir conexões
- [ ] Exibir a proposta, o custo em conexão e o projeto exato ao usuário para confirmação específica antes de qualquer envio
- [ ] Continuar a buscar novas vagas compatíveis assim que a plataforma estiver disponível, sem enviar propostas automaticamente
- [x] Realizar e registrar nesta rodada buscas específicas por transcrição e por planilhas com os mesmos critérios de risco e concorrência
- [x] Confirmar no registro desta rodada que nenhuma proposta foi enviada e nenhuma conexão foi consumida nas buscas de transcrição e planilhas

## Nova revisão da 99Freelas (pedido do usuário 19/08)
- [x] Conferir o perfil público atualizado, o saldo de conexões e o estado da conta sem realizar alterações
- [x] Pesquisar e registrar oportunidades novas compatíveis, sem enviar propostas nem consumir conexões
- [x] Avaliar os resultados e registrar que não houve projeto de escopo claro, baixo risco e concorrência viável para apresentar nesta rodada

## Melhoria do perfil na 99Freelas (pedido do usuário 19/08)
- [x] Verificar o resumo atual, o título e a seção adequada para uma apresentação profissional no perfil
- [x] Preparar texto honesto que destaque serviços, cuidado e compromisso sem alegar experiência não comprovada
- [x] Solicitar confirmação específica antes de salvar qualquer alteração no perfil
- [x] Salvar e conferir no perfil público o título, apresentação, experiência, habilidades e áreas de interesse aprovados

## Alternativas de renda remota sem câmera (pedido do usuário 19/08)
- [x] Mapear alternativas de serviço e produto digital que possam ser executadas de casa com entrega por texto, arquivo ou automação
- [x] Comparar as alternativas por velocidade de primeira venda, custo inicial, dificuldade, risco e compatibilidade com a IA
- [x] Preparar o material de divulgação e o roteiro de atendimento da alternativa inicial recomendada: serviços digitais diretos por mensagem

## Estratégia de transcrição para renda extra (pedido do usuário 19/08)
- [x] Comparar trabalho de transcrição por plataforma e captação direta para a meta desejada de R$ 20–100 por dia
- [x] Preparar uma estratégia inicial de transcrição em português que não prometa recebimento diário garantido
- [x] Criar material de divulgação e critérios de preço, escopo e revisão para transcrições curtas

## Candidatura à GoTranscript (pedido do usuário 19/08)
- [ ] Confirmar os requisitos atuais, idiomas aceitos, teste de entrada e forma de pagamento da GoTranscript
- [x] Preparar o usuário para o teste de transcrição em português, sem enviar candidatura ainda
- [ ] Solicitar confirmação específica antes de criar a conta, fornecer dados pessoais ou enviar a candidatura

## Candidatura assistida à GoTranscript (pedido do usuário 19/08)
- [ ] Conferir na página de candidatura as regras do teste, os campos solicitados e a compatibilidade com o perfil do usuário
- [ ] Confirmar com o usuário os dados necessários antes de preencher ou criar qualquer conta
- [ ] Solicitar confirmação específica antes de submeter o cadastro ou a candidatura
- [ ] Apoiar o teste somente de forma permitida pelas regras da plataforma

## Candidatura individual à Audiotext (decisão do usuário 19/08)
- [x] Registrar os requisitos da candidatura e reiterar que o usuário deve concluir as avaliações sozinho
- [ ] Preparar somente orientação geral permitida, sem responder etapas avaliativas ou manipular a candidatura
- [ ] Apoiar os próximos passos após o resultado informado pelo usuário

## Nova tentativa individual na Audiotext após reprovação (19/08)
- [x] Registrar a reprovação na prova teórica, a nova tentativa após o prazo da plataforma e a proibição de criar conta duplicada ou burlar a avaliação
- [x] Preparar um roteiro geral de estudo de regras de transcrição, sem acessar questões, respostas ou arquivos avaliativos
- [ ] Confirmar com o usuário o resultado de uma nova tentativa e orientar apenas os próximos passos permitidos

## Captação direta como canal prioritário (pedido do usuário 19/08)
- [x] Definir uma oferta inicial de serviços simples, com público, preço, prazo e limites claros
- [x] Atualizar o kit de WhatsApp, Facebook e OLX para comunicar a oferta sem prometer resultados ou qualificação inexistente
- [x] Pesquisar plataformas de transcrição compatíveis com português e registrar regras de entrada e pagamento
- [ ] Apresentar os textos e o plano de divulgação para confirmação específica antes de qualquer publicação ou contato

## Reforço de qualidade para projetos reais (pedido do usuário 19/08)
- [x] Completar a triagem determinística de trabalho freelancer com validação explícita de riscos antes da produção
- [x] Criar teste de regressão da triagem para impedir que a IA declare um serviço profissional pronto sem requisitos essenciais
- [x] Completar os testes de risco para bloquear escopos jurídicos, financeiros, dados sensíveis, ações irreversíveis e publicação externa sem confirmação
- [x] Completar o teste de bloqueio de dados sensíveis, incluindo CPF, senha, token e chaves de acesso
- [x] Testar o bloqueio de escopos financeiros e contábeis que exigem conferência humana qualificada
- [x] Executar na VM os testes automatizados dos guardas de transcrição, redação, automação e triagem de riscos, removendo os arquivos temporários de teste
- [x] Executar na VM cenários E2E de chat incompletos para transcrição, redação e automação via API e conferir o bloqueio antes do modelo
- [x] Limpar na VM todos os dados temporários criados pelos cenários E2E de qualidade e registrar a limpeza
- [x] Publicar na VM somente os reforços de qualidade que passarem nos testes automatizados e na validação de saúde

## Postura de especialista para serviços profissionais (pedido do usuário 19/08)
- [x] Definir um protocolo verificável de análise, execução, revisão e entrega para os serviços compatíveis
- [x] Incorporar a postura profissional ao roteador de chat sem alegar experiência, certificações ou resultados inexistentes
- [x] Cobrir o novo protocolo com testes de regressão e publicar a versão validada na VM
