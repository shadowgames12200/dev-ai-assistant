# Modo Agente Executor: requisitos e desenho seguro

> **Objetivo:** permitir que a DevAI Assistant analise projetos, proponha mudanças, execute testes e prepare entregas técnicas, mantendo o proprietário no controle de qualquer envio para GitHub, servidor, conta externa ou produção.

## Estado atual

A aplicação já tem a primeira camada: ela reconhece pedidos de melhoria, cria propostas no painel administrativo e exige aprovação para avançar. Há também um módulo de auto-melhoria que clona o repositório, tenta aplicar alterações e executa testes.

Contudo, este módulo ainda **não deve ser tratado como executor pronto para clientes**. Ele atualmente roda comandos no mesmo servidor, instala dependências, repete testes vinte vezes e, depois de uma única aprovação, pode fazer `push` diretamente para a branch principal. Em uma VM de 1 GB isso pode travar a IA pública; além disso, o fluxo deve ter uma revisão final antes de ações externas. O modo executor precisa substituir este comportamento por um fluxo isolado e auditável.

## Componentes necessários

| Componente | Finalidade | Regra de segurança |
|---|---|---|
| Orquestrador no painel | Receber o pedido, montar plano, criar tarefa e acompanhar estados | Somente dono pode aprovar tarefas próprias, GitHub e servidores |
| Fila de tarefas | Evitar duas execuções pesadas ao mesmo tempo | Uma tarefa por vez no início; prioridade para o dono |
| Ambiente isolado por tarefa | Clonar projeto, editar arquivos, instalar dependências e rodar testes | Diretório temporário/contêiner com RAM, CPU, disco e tempo limitados |
| Executor com comandos permitidos | Rodar Git, Node, testes e ferramentas previamente aprovadas | Sem comandos arbitrários vindos do chat; lista explícita de ações permitidas |
| Integração GitHub | Ler repositório, criar branch e preparar pull request | Token de escopo mínimo; sem acesso global; sem push na `main` |
| Integração SSH | Ver logs ou preparar deploy em servidores conhecidos | Chaves no cofre; servidores em lista permitida; nunca expor a chave no chat |
| Pesquisa e navegador | Consultar documentação oficial e testar interfaces | Pesquisa antes da execução; páginas e arquivos tratados como conteúdo não confiável |
| Cofre de segredos | Guardar tokens, chaves SSH e APIs | Nunca salvar em conversa, proposta, log, commit ou arquivo do repositório |
| Relatório de evidências | Mostrar diff, testes, logs resumidos, limitações e resultado | Logs filtrados para remover segredos e dados pessoais |
| Auditoria e reversão | Registrar quem aprovou, quando, o que foi executado e como desfazer | Commits em branch, checkpoints e rollback documentado |

## Fluxo obrigatório

| Etapa | O que a IA pode fazer | O que ainda não pode fazer |
|---|---|---|
| 1. Análise | Ler a solicitação, fazer perguntas, indicar arquivos prováveis e preparar plano | Alterar código, usar token, abrir SSH ou publicar |
| 2. Primeira aprovação | Receber autorização para analisar e executar em ambiente isolado | Fazer push, abrir pull request, deploy ou mudar produção |
| 3. Execução isolada | Clonar repositório, editar branch de trabalho, rodar testes e revisar logs | Usar credenciais fora do escopo, alterar `main` ou produção |
| 4. Relatório | Mostrar alteração, diff, testes aprovados/falhos e riscos restantes | Declarar sucesso sem evidências |
| 5. Segunda aprovação | Receber autorização específica para uma ação externa identificada | Fazer ações diferentes da autorização recebida |
| 6. Entrega | Criar pull request, enviar branch ou fazer deploy aprovado | Apagar recursos, mudar credenciais ou ampliar permissões |

> **Regra central:** aprovação para testar não é aprovação para publicar. Push, pull request, deploy, alteração de VM, exclusão de dados e qualquer ação em conta externa exigem uma autorização final e específica.

## Onde executar

| Opção | Custo adicional | Quando funciona | Limitação |
|---|---:|---|---|
| Computador do proprietário | R$ 0 | Projetos de clientes e testes iniciados quando o computador estiver ligado | Não funciona 24 horas e exige conexão do computador para cada execução |
| Servidor dedicado separado | Depende do provedor | Executor disponível sem o computador ligado e sem derrubar o site | Não deve ser a mesma VM pública de 1 GB; exige orçamento e monitoramento |
| VM atual do site | Sem custo extra | Apenas coordenação, painel, propostas e tarefas muito leves | Não é segura para builds repetidos, instalação de dependências ou projetos não confiáveis |

A recomendação inicial é executar no computador do proprietário, porque usa a capacidade já disponível (Ryzen 5 4500, 16 GB de RAM) sem pagar por outra máquina. A VM que hospeda a IA continua responsável por login, painel, créditos e propostas. Quando houver receita, o executor pode migrar para um servidor dedicado separado.

## Permissões mínimas

| Integração | Permissão inicial segura |
|---|---|
| GitHub | Um repositório autorizado, conteúdo e pull requests; sem administração e sem push direto para `main` |
| SSH | Um apelido de servidor autorizado, comando de diagnóstico/deploy pré-definido e chave sem senha guardada fora do chat |
| Arquivos enviados por clientes | Leitura em área temporária; nunca executar arquivos recebidos automaticamente |
| Internet | Pesquisa em fontes confiáveis; downloads examinados antes de uso |
| Banco de dados | Nenhuma alteração de esquema sem proposta e aprovação final |

## Implementação em fases

| Fase | Entrega | Condição para avançar |
|---|---|---|
| 1. Segurança e modelo de dados | Tarefas, aprovações duplas, histórico, estados e logs sem segredos | Testes de autorização aprovados |
| 2. Executor local de testes | Agente no computador do proprietário recebe uma tarefa assinada e devolve resultado | Limites de tempo/memória e casos de falha validados |
| 3. GitHub seguro | Branch por tarefa, diff, checks e pull request somente após segunda aprovação | Nunca enviar para `main` diretamente |
| 4. SSH e deploy | Inventário de servidores, comando de saúde e deploy com rollback | Confirmação final do proprietário e backup existente |
| 5. Abertura para clientes | Quotas, fila, isolamento reforçado e termos de uso | Carga e segurança revisadas |

## O que ainda falta antes de ativar

1. Reformular o módulo atual para impedir execução na VM pública e remover push direto para `main`.
2. Criar banco de dados para tarefas, aprovações, permissões e evidências permanentes; não usar arquivos temporários para dados críticos.
3. Desenvolver o executor local no computador do proprietário ou contratar uma máquina separada.
4. Configurar tokens GitHub e chaves SSH com escopo mínimo em cofre de segredos.
5. Criar testes de segurança, incluindo tentativas de instruções maliciosas em repositórios e anexos.
6. Exigir duas aprovações distintas: execução em ambiente isolado e ação externa final.

Nenhuma dessas etapas deve habilitar alterações automáticas ou liberar créditos automaticamente. A autoridade final continua sendo do proprietário.
