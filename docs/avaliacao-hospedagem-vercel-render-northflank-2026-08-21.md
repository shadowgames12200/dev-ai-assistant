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
