# Plano de capacidade inicial para até 100 clientes cadastrados

> **Objetivo:** orientar uma fase beta comercial de baixo volume sem tratar planos gratuitos como infraestrutura de produção. Este documento não é garantia de desempenho, receita ou disponibilidade; as decisões de atualização devem ser tomadas a partir de métricas reais.

## Cenários que não devem ser confundidos

| Cenário | Definição | Risco técnico |
|---|---|---|
| Clientes cadastrados | Pessoas que possuem conta, mas podem nunca voltar ao produto | Baixo; principalmente banco, autenticação e armazenamento |
| Clientes ativos mensais | Pessoas que usam a IA ao menos uma vez no mês | Médio; consome chamadas aos provedores de LLM e armazenamento de conversas |
| Clientes simultâneos | Pessoas enviando mensagens no mesmo intervalo | Alto; aumenta filas, latência e risco de atingir quotas do provedor de IA |
| Tarefas de agente | Solicitações aprovadas que clonam, alteram ou testam código | Alto; devem ficar em fila e rodar uma por vez no executor efêmero |

## Arquitetura de início responsável

| Componente | Responsabilidade | Regra de segurança e capacidade |
|---|---|---|
| Serviço web comercial | Interface, API, login, créditos e painel | Não executar builds, comandos de cliente ou tarefas longas no mesmo processo |
| Supabase | Dados persistentes, autenticação, conversas, propostas e referências de anexos | Definir retenção e acompanhar tamanho do banco, arquivos e usuários ativos |
| Provedores de LLM | Respostas de chat e análise | Aplicar limite por conta, fila e mensagem clara quando houver indisponibilidade ou quota |
| GitHub Actions | Testes aprovados em branch temporária | Uma tarefa por vez, tempo máximo e nenhuma chave de produção no runner |
| Painel do proprietário | Aprovação, auditoria e decisão de ações externas | Aprovação separada para teste e para pull request, deploy ou SSH |

## Limites iniciais recomendados

| Área | Regra de início | Motivo |
|---|---|---|
| Conversas | Limite de créditos já existente e limitação de anexos | Evita consumo inesperado de APIs e memória |
| Modo agente | Uma execução pendente/ativa por vez | Evita concorrência de builds e facilita auditoria |
| Anexos | Rejeitar excesso, arquivos muito grandes ou formatos não suportados antes de chamar IA | Protege custo, memória e segurança |
| Auto-melhoria | Proposta e testes apenas depois de aprovação; nunca aplicar automaticamente | Mantém o dono no controle das alterações |
| Deploy | Não publicar diretamente após um teste; exigir aprovação final | Reduz risco de indisponibilidade para clientes |

## Sinais para atualizar a infraestrutura antes de prejudicar clientes

| Sinal observado em produção | Ação recomendada |
|---|---|
| Clientes relatam espera de inicialização ou mensagens que expiram | Migrar o serviço web para plano comercial sem hibernação |
| Muitas mensagens em paralelo aguardando resposta | Criar fila de chat e aumentar a capacidade do serviço web conforme a medição real |
| Quotas ou erros recorrentes de provedores de LLM | Reduzir temporariamente o limite por usuário, mostrar status e adicionar provedor de fallback autorizado |
| Banco ou armazenamento próximos do limite do plano | Limpar dados conforme política, mover anexos para armazenamento adequado ou atualizar o plano |
| Tarefas de agente acumuladas ou excedendo o tempo do runner | Manter fila, reduzir escopo e usar executor mais capaz somente após aprovação |

## Regra de lançamento

O produto pode iniciar como **beta controlada**, com poucos usuários convidados e comunicação clara de que a disponibilidade pode variar. A venda ampla de créditos só deve ser considerada após observar uso real sem indisponibilidade recorrente, validar a recarga manual e definir uma hospedagem comercial que não dependa de hibernação gratuita.

## Limites que permanecem mesmo com uma arquitetura melhor

Uma hospedagem comercial não substitui as quotas dos provedores de IA, não garante que serviços externos estejam sempre disponíveis e não permite que a aplicação execute código de clientes sem isolamento. A IA também não deve resolver CAPTCHA, acessar contas não conectadas pelo proprietário ou publicar mudanças externas sem aprovação explícita.
