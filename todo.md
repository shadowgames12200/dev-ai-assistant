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

## Recarga manual por Pix (pedido do usuário 20/08)
- [x] Definir pacotes, preço, créditos por pacote e a mensagem de que a liberação depende de conferência manual
- [x] Gerar dinamicamente o código Pix Copia e Cola por pacote a partir da chave, nome e cidade cadastrados com segurança
- [x] Criar uma tela de recarga exibida quando os créditos acabam, com pacotes e instruções de pagamento
- [x] Criar QR Code a partir do código Pix Copia e Cola e botão de cópia sem armazenar dados de pagamento de clientes
- [x] Registrar uma solicitação de recarga pendente, com usuário, pacote e horário, sem liberar créditos automaticamente
- [ ] Notificar o proprietário por e-mail quando houver solicitação de recarga pendente, se a configuração permitir
- [x] Inspecionar conectores e configurações disponíveis para e-mail e WhatsApp antes de ativar qualquer alerta externo
- [x] Ativar o conector Gmail autorizado pelo proprietário e confirmar a disponibilidade sem enviar mensagem

## Confirmação de pagamento Pix e alerta ao proprietário
- [x] Mapear os dados mínimos que o painel já registra para identificar uma solicitação sem usar dados bancários do cliente
- [ ] Pesquisar alternativas oficiais de confirmação Pix por webhook e seus requisitos de conta, credenciais e segurança
- [ ] Comparar a conferência manual atual com a confirmação automatizada por provedor, preservando a aprovação manual de créditos
- [ ] Solicitar escolha explícita do proprietário antes de conectar banco, provedor Pix ou webhook
- [ ] Não ativar recebimento automático, aprovação automática ou transferência de valores em nenhuma etapa
- [ ] Ajustar o alerta de solicitação Pix para informar usuário, pacote, valor e créditos, deixando explícito que o pagamento deve ser conferido manualmente
- [ ] Validar o alerta integrado ao proprietário sem criar pagamento, solicitação de cliente ou liberar créditos
- [ ] Configurar uma conta Gmail dedicada como remetente de alertas e o Gmail pessoal do proprietário como destinatário
- [ ] Solicitar somente a senha de aplicativo do remetente, nunca a senha normal da conta
- [ ] Iniciar o cadastro da conta Gmail dedicada e interromper para o proprietário preencher dados pessoais, telefone, CAPTCHA ou código de verificação
- [x] Reconfirmar a verificação em duas etapas e a indisponibilidade atual de senha de aplicativo; não usar senha normal da conta
- [x] Comparar alternativa de provedor de e-mail transacional se a conta Gmail nova continuar sem senha de aplicativo
- [x] Registrar a decisão de manter somente o painel administrativo, sem e-mail automático nem provedor externo nesta fase
- [x] Cobrir em teste o alerta operacional ao proprietário e registrar que a entrega por e-mail depende de canal configurado separadamente
- [x] Exibir solicitações pendentes no painel administrativo e liberar o pacote somente após confirmação manual do proprietário
- [x] Cobrir o fluxo com testes de segurança, contrato e interface antes de publicar
- [x] Registrar os pacotes aprovados: R$ 10 por 25 créditos, R$ 20 por 60 créditos e R$ 50 por 180 créditos
- [x] Configurar o suporte dos clientes para o WhatsApp 38 99110-9806 sem revelar dados desnecessários
- [ ] Verificar se há integração WhatsApp Business disponível para o número 38 98405-7434 antes de prometer alerta automático
- [ ] Configurar aviso inicial ao proprietário pelo e-mail charleshenriquegonsalves05@gmail.com, se o canal de proprietário estiver disponível
- [x] Configurar os dados de Pix como segredo do servidor, sem deixá-los codificados ou expostos no repositório
- [x] Adicionar teste e endpoint leve para validar a geração do payload Pix por pacote sem expor valores de configuração
- [ ] Validar o canal de e-mail disponível para alertar o proprietário sobre pedidos pendentes
- [x] Registrar o WhatsApp Business como melhoria futura, sem bloquear a recarga manual atual
- [x] Adicionar teste de interface da página de recarga cobrindo pacotes, QR Code, Pix Copia e Cola, cópia e solicitação manual
- [x] Adicionar teste de interface do painel administrativo para os estados vazio e pendente de recargas Pix, com ações de aprovar/rejeitar

## Publicação da interface de créditos (20/08)
- [x] Compilar o cliente e o backend com a experiência de créditos atualizada
- [x] Publicar os arquivos estáticos e o backend compilado na VM Azure
- [x] Reiniciar o processo gerenciado e confirmar estado online, ativos publicados e resposta HTTP local

## Sincronização do GitHub (20/08)
- [x] Verificar divergências do repositório local e remoto e excluir dados de runtime do commit
- [x] Confirmar que o checkpoint cbed5f9 contém explicitamente a interface de créditos e os testes validados
- [x] Criar commit limpo de remoção de dados de runtime e artefatos gerados do repositório
- [ ] Enviar a versão ao GitHub e confirmar que a branch remota está atualizada
- [x] Remover do versionamento os JSONs de runtime e o bundle compilado, preservando os arquivos locais e da VM
- [x] Confirmar que o repositório pode ser reconstruído somente a partir do código-fonte antes do envio ao GitHub

## Auditoria de continuidade solicitada pelo proprietário
- [x] Revisar checkpoints, publicações e alterações locais posteriores ao último checkpoint
- [x] Separar pendências técnicas reais de opções adiadas por decisão do proprietário
- [x] Confirmar se o reforço avançado da IA foi apenas testado localmente ou já foi publicado na VM
- [x] Entregar uma lista priorizada com estado, bloqueio e próximo passo de cada pendência

## Finalização
- [x] Verificação final de logs e estabilidade
- [x] Checkpoint final

## Estabilidade de produção após auditoria (20/08)
- [x] Eliminar tentativas recorrentes de MySQL no painel de créditos quando a persistência JSON for a fonte ativa na VM
- [x] Tratar a ausência de OAuth externo como modo local suportado, sem registrar erro enganoso na inicialização
- [x] Revalidar logs, saúde HTTP e fluxo de fallback após a publicação

## Avaliação de projeto da 99Freelas (link enviado pelo proprietário)
- [x] Ler o escopo, prazo, entregáveis e condições do projeto 777684 sem interagir com a plataforma
- [x] Comparar o trabalho com as capacidades reais da IA, os limites da VM e a necessidade de revisão humana
- [x] Identificar lacunas de preparo e riscos de qualidade, prazo, dados sensíveis ou ações externas
- [x] Entregar ao proprietário a recomendação objetiva de não produzir proposta por envolver recuperação de acesso sem autorização verificável

## Avaliação de projeto 777685 da 99Freelas (link enviado pelo proprietário)
- [x] Ler escopo, orçamento, prazo e entregáveis sem interagir com a plataforma
- [x] Registrar e entregar a avaliação da capacidade da IA e da VM, incluindo a revisão humana necessária
- [x] Registrar e entregar os riscos de autorização, dados, prazo e escopo identificados
- [x] Entregar a recomendação objetiva e adiar qualquer proposta até o anúncio se tornar público e o proprietário confirmar o texto

## Avaliação de projeto 777705 da 99Freelas (link enviado pelo proprietário)
- [x] Ler escopo, orçamento, prazo e entregáveis sem interagir com a plataforma
- [x] Avaliar capacidade da IA, necessidade de revisão e viabilidade de concorrer
- [x] Identificar riscos de autorização, dados sensíveis, prazo, escopo e ações externas
- [x] Preparar recomendação objetiva; acompanhar até o anúncio ficar público sem criar ou enviar proposta
- [x] Confirmar que o anúncio ainda está exclusivo, com 0 pontos de convite, e não pode receber proposta da conta atual
- [ ] Preparar proposta com escopo delimitado, valor fechado e prazo responsável sem alegar experiência não comprovada
- [ ] Apresentar o texto completo ao proprietário e aguardar confirmação específica antes de enviar

## Auditoria de pendências técnicas (20/08)
- [x] Verificar no código e na VM se o fluxo de autoaperfeiçoamento com aprovação do dono permanece funcional
- [x] Concluir auditoria documentada das pendências antigas de qualidade, testes e publicação, identificando o que já foi coberto e o que permanece aberto
- [x] Registrar explicitamente as correções de estabilidade confirmadas nesta auditoria, sem afirmar que não houve mudanças necessárias
- [x] Salvar o registro final da auditoria e criar um checkpoint específico depois de concluir a revisão documentada
- [x] Mapear item a item as pendências antigas relevantes como cobertas, pendentes ou fora de escopo
- [x] Acrescentar uma seção de publicação e implantação, separando a VM ativa, a validação local e itens ainda não revalidados
- [x] Confirmar no histórico que o checkpoint salvo corresponde à auditoria técnica e às correções de estabilidade desta rodada

## Redefinição de chave de aprovação (pedido do usuário 20/08)
- [x] Localizar a variável de aprovação ativa na VM sem ler ou expor a chave antiga
- [x] Atualizar a chave de aprovação para o valor escolhido pelo proprietário e reiniciar a aplicação
- [x] Validar somente a presença da configuração e a saúde do processo, sem expor o segredo
- [x] Confirmar de forma não sensível se a chave ativa está no ambiente do processo PM2, registrando somente presença ou ausência
- [x] Revalidar a aceitação da chave sem gravar seu valor em comandos, logs ou documentos
- [x] Corrigir a ausência atual da configuração de aprovação no ambiente do processo publicado e revalidar sua presença sem revelar o valor
- [x] Reaplicar a chave no processo PM2 por um método verificável e registrar somente resultado de correspondência, sem expor valores
- [x] Validar que o fluxo de aprovação aceita a chave ativa sem alterar propostas existentes
- [x] Reaplicar explicitamente a chave no comando de reinício do PM2 e comprovar presença e correspondência após o processo voltar a ficar online
- [x] Salvar o estado do PM2 após a reaplicação e documentar, sem valores, o mecanismo de persistência usado

## Correção de acesso da conta do proprietário (pedido do usuário 20/08)
- [x] Verificar se a aplicação pública responde e se o formulário de login abre normalmente
- [x] Investigar logs e dados de autenticação sem alterar e-mail, senha, créditos ou conversas
- [x] Corrigir somente a causa confirmada e validar o login da conta do proprietário
- [x] Abrir a tela de login sem sessão e confirmar visualmente os campos e o envio pela interface

## Verificação do painel administrativo (pedido do usuário 20/08)
- [x] Confirmar na conta administrativa que o botão de painel abre a rota e a interface corretas
- [x] Verificar os controles visíveis sem alterar usuários, créditos ou solicitações
- [x] Corrigir e publicar somente se for encontrada uma falha real

## Ações de conversa na barra lateral (pedido do usuário 20/08)
- [x] Revisar a implementação atual da lista de conversas e da exclusão existente
- [x] Adicionar botão de três pontos acessível ao lado de cada conversa
- [x] Oferecer ação de exclusão que não selecione a conversa ao ser acionada
- [x] Cobrir a interação com teste de interface e validar a lista atualizada
- [x] Compilar, publicar na VM e conferir visualmente a barra lateral atualizada

## Entrar, cadastrar e conta do usuário (pedido do usuário 20/08)
- [x] Analisar o modelo de usuário e o fluxo de login local para preservar contas, créditos e conversas existentes
- [x] Separar a tela de acesso em abas claras de Entrar e Cadastrar
- [x] Permitir que o cadastro crie nome de usuário, e-mail e senha, com validação de duplicidade
- [x] Criar procedimento protegido para o usuário atualizar nome, e-mail e/ou senha com confirmação da senha atual
- [x] Criar página Conta para editar os dados e manter a opção Sair no menu da conta
- [x] Cobrir cadastro, atualização e controles de interface com testes de regressão
- [x] Compilar, publicar e validar os fluxos sem alterar os dados já persistidos
- [x] Corrigir a rota publicada /account, que retornou 404 durante a validação da interface
- [x] Corrigir a abertura do menu da conta administrativa, que não exibiu os atalhos Conta e Sair durante a validação

## Validação final publicada antes do checkpoint (20/08)
- [x] Registrar que o link Painel admin do menu administrativo alcança /admin e expõe somente os controles esperados
- [x] Registrar a regressão aprovada para cadastro, login por usuário/e-mail, duplicidade e atualização protegida por senha atual
- [x] Validar visualmente a remoção de uma conversa da barra lateral sem alterar a conversa ativa
- [x] Corrigir a atualização visual para remover a conversa efetivamente excluída e preservar a conversa ativa quando outra for apagada
- [x] Validar em produção a criação e atualização de uma conta temporária sem afetar identidade, créditos ou conversas de usuários existentes
- [x] Confirmar que o logout local funciona por endpoint e corrigir o redirecionamento visual para a rota de acesso suportada
- [x] Corrigir a rota publicada de acesso que retornou 404 após o logout, antes de executar o cadastro temporário

## Proteção contra acesso indevido e manipulação (pedido do usuário 20/08)
- [x] Revisar exposição de rotas, autenticação, sessões, dados persistidos e ações administrativas
- [x] Reforçar validação de entrada, limites de tentativas e respostas de erro sem revelar informações sensíveis
- [x] Garantir que a IA trate conteúdo de usuários e anexos como dados, e não como instruções de sistema ou autorização para ações externas
- [x] Verificar que segredos, chaves e informações de outros usuários não sejam retornados em respostas, logs ou interface
- [x] Criar testes de regressão para bloqueios de acesso e tentativas de manipulação por texto
- [x] Documentar limites reais e medidas de proteção aplicadas, sem alegar segurança absoluta

## Autoaprendizagem com proposta e aprovação (pedido do usuário 20/08)
- [x] Revisar o fluxo atual de propostas e aprovações para manter a autorização exclusiva do proprietário
- [x] Estruturar propostas com contexto, problema observado, pesquisa sugerida, benefícios claros, riscos, custo/impacto e arquivos possivelmente afetados
- [x] Exigir aprovação explícita antes de pesquisar externamente, registrar aprendizado ou alterar código, dados, configurações ou integrações
- [x] Exibir na página de aprovação uma explicação simples sobre o que mudará e como desfazer, quando aplicável
- [x] Registrar aprendizagem aprovada como regra, documentação ou código somente após a aprovação correspondente
- [x] Cobrir as permissões e os estados de proposta com testes de regressão
- [x] Armazenar somente oportunidades mínimas e não sensíveis observadas em conversas, sem pesquisar ou executar ações automaticamente
- [x] Permitir ao proprietário criar uma proposta manual usando as oportunidades armazenadas
- [x] Criar uma triagem semanal limitada que apenas produza propostas pendentes, sem pesquisar profundamente nem aplicar mudanças
- [x] Limitar a triagem a itens relevantes e bloquear dados pessoais, segredos, credenciais e instruções maliciosas

## Navegação de autoaprendizagem (20/08)
- [x] Fazer a rota /approvals indicada pelo chat abrir a área de aprovação do painel administrativo, sem expor controles a usuários comuns
- [x] Cobrir a rota de aprovações em teste de interface, compilar e publicar na VM
- [x] Cobrir em regressão que um usuário comum na rota /approvals recebe somente a tela de acesso restrito, sem controles administrativos

## Prioridade de renda extra e infraestrutura (pedido do usuário 20/08)
- [ ] Priorizar serviços digitais por texto que possam gerar renda sem câmera e sem carga contínua na VM
- [ ] Preparar uma sequência prática de divulgação, triagem e entrega com revisão humana antes de qualquer compromisso com cliente
- [ ] Definir uma regra simples de reinvestimento para melhorar a infraestrutura somente após receita efetivamente recebida

## Perguntas do usuário (18/08)
- [x] Verificar se a auto-melhoria da IA está funcionando na VM
- [ ] Explicar funcionamento híbrido: VM online + LM Studio (Windows 11) local como fallback do LLM

## Correção da auto-melhoria (pedido do usuário 18/08)
- [x] Persistir propostas de autoaprendizagem na fonte JSON ativa da VM, preservando o fallback leve em vez de criar tabela MySQL
- [x] chat.send: quando intent=improvement, criar proposta real sob aprovação do proprietário
- [x] Registrar rota /approvals no App.tsx para abrir o painel administrativo protegido
- [x] Integrar propostas, aprovação com chave do dono e rejeição ao painel administrativo real

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
- [x] Rebuildar frontend (vite) localmente (sandbox) e enviar à VM
- [x] Testar fluxo completo de aprovação com chave
- [x] Remover usuário de teste e conversas de teste
- [x] Criar checkpoint final das validações técnicas publicadas

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
- [x] Executar E2E na VM de um caso incompleto de transcrição e de redação ou automação
- [x] Confirmar o encerramento idempotente de respostas SSE, a regressão de streaming e a ausência de erros `write after end` na VM

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
- [x] Testar cenários completos de serviço freelancer na VM, revisar resultados e limpar dados temporários

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

## Fortalecimento avançado de mentalidade e execução da IA
- [x] Auditar os protocolos atuais de planejamento, segurança, uso de ferramentas, revisão e entrega
- [x] Definir um currículo prático de competências gerais, programação, documentos, análise e trabalho freelancer sem prometer conhecimento ilimitado
- [x] Reforçar a distinção entre fatos, hipóteses, estimativas e dados ausentes antes de responder
- [x] Reforçar planejamento por etapas, verificação independente e comunicação transparente de limites
- [x] Reforçar resistência a instruções maliciosas, vazamento de segredos e ações externas não aprovadas
- [x] Cobrir os novos protocolos com cenários de regressão antes de publicar
