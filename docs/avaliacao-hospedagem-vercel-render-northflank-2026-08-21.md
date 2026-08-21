# Avaliação de hospedagem sem VM Azure

> **Escopo:** verificar se Vercel, Render e Northflank podem manter a DevAI Assistant online e fornecer uma base segura para o futuro modo agente executor. Esta é uma avaliação técnica; nenhuma conta, serviço, banco ou cobrança foi criada.

## Necessidades da aplicação atual

| Função | Necessidade de infraestrutura | Pode estar em função sob demanda? |
|---|---|---|
| Interface React e API Express/tRPC | HTTP, streaming e variáveis de ambiente | Sim, com adaptação ao modelo do provedor |
| Login, conversas, créditos e propostas | Banco persistente | Sim, se o banco for externo/persistente |
| Uploads e anexos | Armazenamento de objetos externo | Sim; não pode depender de disco local |
| Chamadas Gemini/Groq/OpenAI | Saída HTTPS e limites de requisição | Sim |
| Autoaprendizagem semanal | Agendamento confiável e registro de tarefa | Sim, com cron/fila |
| Executor de código de cliente | Processo isolado, efêmero, com limites e logs | **Não deve rodar dentro do servidor do site** |
| GitHub/SSH após aprovação | Segredos restritos, auditoria e worker separado | Requer worker/job isolado |

## Evidências oficiais dos provedores

| Provedor | O que atende | Limite que impede substituir o executor sozinho |
|---|---|---|
| Vercel Hobby | Hospeda funções HTTP, streaming, autenticação e cron; escala a zero quando não há requisições | É plano gratuito para uso pessoal e não comercial; as funções têm duração máxima de 300 s no Hobby e não são um worker contínuo |
| Render Free | Pode hospedar um app Express público e fazer deploy pelo GitHub | Só 512 MB/0,1 CPU; pausa após 15 min sem tráfego; perde disco local em pausa/redeploy; não permite worker, jobs avulsos, disco persistente ou shell no plano gratuito; banco Postgres gratuito expira após 30 dias |
| Northflank Developer Sandbox | Permite até 2 serviços e 2 jobs; possui serviços e jobs por contêiner | O próprio provedor diz que não é para produção; exige cartão mesmo no plano gratuito e oferece recursos limitados |

## Conclusão técnica preliminar

Nenhuma das três opções gratuitas pode ser tratada como substituta integral e permanente de uma VM para **site público + executor de código autônomo**. Vercel é apropriada para o front-end/API sob demanda, mas não para compilar código de clientes continuamente. Render Free é insuficiente para a aplicação atual por memória, hibernação e ausência de worker. Northflank é a única das três que oferece uma separação natural de serviços e jobs por contêiner, mas o seu plano gratuito é explicitamente de teste, não de produção.

Uma arquitetura segura futura pode separar: Vercel para interface/API, banco e arquivos persistentes externos, e Northflank para um job de teste efêmero. No entanto, a execução de tarefas reais de clientes precisa de plano pago, PC local ligado ou uma plataforma que aceite explicitamente essa carga, com autorização do proprietário e limites implementados.

## Referências

[1] Vercel, [Hobby Plan](https://vercel.com/docs/plans/hobby).

[2] Vercel, [Functions](https://vercel.com/docs/functions).

[3] Vercel, [Cron Jobs](https://vercel.com/docs/cron-jobs).

[4] Render, [Deploy for Free](https://render.com/docs/free).

[5] Render, [Web Services](https://render.com/docs/web-services).

[6] Render, [Background Workers](https://render.com/docs/background-workers).

[7] Northflank, [Pricing on Northflank](https://northflank.com/docs/v1/application/billing/pricing-on-northflank).

[8] Northflank, [Run containers and micro-services](https://northflank.com/docs/v1/application/run/run-containers-and-micro-services).

## Complemento: execução online gratuita por GitHub Actions

O GitHub Actions é uma alternativa adequada para **testes efêmeros e aprovados** de um repositório autorizado. A documentação do GitHub informa que o uso de runners padrão hospedados pelo GitHub é gratuito para repositórios públicos. Um workflow com o evento `workflow_dispatch` pode ser iniciado manualmente na interface, pela CLI ou API, o que permite ligá-lo a uma aprovação dentro do painel da DevAI Assistant.

Ele não é um terminal persistente nem deve receber tokens de produção, chave SSH ampla, segredo de pagamento ou credenciais de clientes. Cada workflow precisa ser descartável, com permissões mínimas, sem segredos por padrão e limitado a testar uma branch temporária. A ação externa — commit em `main`, pull request, deploy ou SSH — deve permanecer fora do job de teste e requerer aprovação independente.

[9] GitHub Docs, [About billing for GitHub Actions](https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions).

[10] GitHub Docs, [GitHub-hosted runners](https://docs.github.com/actions/using-github-hosted-runners/about-github-hosted-runners).

[11] GitHub Docs, [Manually running a workflow](https://docs.github.com/actions/managing-workflow-runs/manually-running-a-workflow).

## Arquitetura recomendada: Vercel + GitHub Actions

| Componente | Plataforma | Responsabilidade | Limite obrigatório |
|---|---|---|---|
| Interface, login, painel, chat e propostas | Vercel | Atender usuários e registrar uma tarefa aprovada | Não executa comandos de projeto de cliente |
| Banco e anexos | Serviços persistentes externos | Guardar dados, aprovações e referências de arquivo | Sem dependência de disco temporário da função |
| Executor de testes | GitHub Actions em runner hospedado | Clonar uma branch temporária, instalar dependências, rodar testes e devolver logs | Efêmero; sem segredos de produção, SSH, Pix ou acesso amplo ao GitHub |
| Ações externas | Painel do proprietário | Autorizar separadamente pull request, deploy ou acesso SSH | Proibido executar automaticamente após os testes |

O site na Vercel pode disparar um workflow `workflow_dispatch` por uma API protegida **somente após a aprovação do proprietário**. O job usa um runner descartável, envia apenas o identificador da tarefa/branch e grava um relatório. Ele não substitui um computador permanente: não mantém um terminal aberto, não atende conexões SSH e não pode realizar tarefas sem limite. Essa separação é precisamente o que protege o site caso um teste consuma recursos ou falhe.

## Papel do Supabase na arquitetura de baixo custo

O Supabase pode substituir o banco de dados, autenticação e armazenamento de arquivos da aplicação, evitando dependência do disco local de uma VM. A documentação de preços indica, para o plano gratuito, até dois projetos ativos, 500 MB de banco por projeto, 50 mil usuários ativos mensais e limites de armazenamento; ao atingir os limites, não há garantia de continuidade sem alteração de plano. A plataforma também permite agendar Edge Functions com `pg_cron`, mas isso não transforma a função em um executor de código sem limite.

Assim, o Supabase é adequado para registrar usuários, conversas, créditos, tarefas, aprovações, logs e anexos. Ele não deve receber tokens de GitHub, chaves SSH ou código de clientes para executar. A execução aprovada continua no runner efêmero do GitHub Actions.

## Restrição de uso comercial da Vercel

A DevAI Assistant pretende vender créditos e atender clientes. A documentação da Vercel informa que o plano Hobby é somente para uso pessoal e não comercial. Portanto, ele pode ser utilizado para desenvolvimento e demonstração privada, mas **não** deve hospedar a versão pública com cobrança de créditos. Uma hospedagem comercial exige plano compatível, ou uma plataforma cujos termos autorizem explicitamente esse uso.

[12] Supabase, [Pricing](https://supabase.com/pricing).

[13] Supabase Docs, [About billing on Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase).

[14] Supabase Docs, [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions).

[15] Vercel Docs, [Hobby Plan](https://vercel.com/docs/plans/hobby).

[16] Vercel Docs, [Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines).

## Adequação do Render para a versão comercial

Ao contrário do Vercel Hobby, a documentação de preços do Render oferece um workspace Hobby de US$ 0 por mês mais custo de computação e não limita o workspace a uso pessoal não comercial. Assim, ele é mais apropriado para uma **versão inicial comercial** da DevAI Assistant. Contudo, o serviço web gratuito tem 512 MB de RAM e 0,1 CPU; ele hiberna após 15 minutos sem tráfego, leva aproximadamente um minuto para voltar e pode ser reiniciado a qualquer momento. A própria documentação do Render diz para não usar instâncias gratuitas em aplicações de produção.

O Render gratuito não fornece acesso de shell, disco persistente, jobs pontuais ou banco permanente: arquivos locais somem após reinício/hibernação e o Postgres gratuito expira após 30 dias. O caminho técnico mais coerente é, portanto: Render Web Service para uma demonstração comercial de baixo volume, **Supabase** para banco e arquivos persistentes, e GitHub Actions para testes efêmeros aprovados. Para clientes pagantes que esperam resposta imediata e confiável, é necessário trocar o serviço web por uma instância paga adequada; não há garantia de disponibilidade contínua no plano gratuito.

[17] Render Docs, [Deploy for Free](https://render.com/docs/free).

[18] Render, [Pricing](https://render.com/pricing).
