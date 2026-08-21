# Recomendação de hospedagem gratuita permanente para a DevAI Assistant

> **Conclusão:** fora da Oracle Cloud, a alternativa oficial mais adequada encontrada é o **Google Cloud Free Tier**, usando uma instância Compute Engine **e2-micro** dentro dos limites da camada gratuita. Ela é gratuita de modo contínuo enquanto os limites forem respeitados, mas exige cartão ou outro meio de pagamento válido para verificação e uma conta de faturamento ativa. Não é uma VM mais potente que a atual; portanto, não elimina sozinha o problema de memória.

## Situação atual

A conta Azure informou que a avaliação gratuita expirou e que seus serviços foram pausados. O portal não disponibilizou uma tabela de valores de reativação: ao abrir a máquina `Devaiassistant`, retornou um erro interno do controle de recursos. Como a IA e o SSH também deixaram de responder, não é seguro esperar recuperação automática. Nenhum upgrade, reinício ou cobrança foi confirmado.

## Alternativas verificadas

| Alternativa | Gratuita para sempre? | Serve como VM Linux persistente? | Limitação decisiva | Veredito |
|---|---:|---:|---|---|
| **Google Cloud Free Tier — e2-micro** | Sim, dentro do limite mensal | Sim | Capacidade pequena, semelhante à VM Azure de 1 GB; requer cartão e atenção aos limites | **Recomendada** |
| Azure atual | Não | Sim | A avaliação venceu e os serviços foram pausados | Não atende ao requisito de custo zero |
| AWS Free Tier / EC2 | Não deve ser considerada permanente | Sim | A gratuidade de VM é promocional ou limitada no tempo; serviços “always free” não equivalem a uma EC2 livre contínua | Não atende ao requisito |
| Plataformas de deploy sem VM | Algumas têm faixas gratuitas | Parcialmente | Podem suspender o serviço sem acesso, não fornecem VM completa e não substituem o fluxo atual com PM2/SSH | Não recomendada para esta migração |

## Google Cloud: o que é gratuito e o que exige cuidado

O Google Cloud mantém uma camada gratuita contínua para produtos selecionados, inclusive Compute Engine, sujeita a limites mensais. A oferta publicada inclui uma instância e2-micro, até 30 GB de disco persistente padrão e até 1 GB de transferência de saída mensal. A máquina deve ser criada em uma região elegível da oferta; antes de criar, é necessário conferir no console qual zona elegível está disponível para a conta. [1] [2]

A entrada exige um cartão ou outro método de pagamento válido para verificar identidade. A documentação menciona uma autorização temporária entre US$ 0,00 e US$ 1,00, que não é cobrança final. Contudo, após a ativação de conta de faturamento, haverá cobrança caso sejam criados recursos fora da camada gratuita, escolhido disco/região indevidos, excedido tráfego ou usado qualquer serviço pago. [2]

> “You’ll only be billed for usage that exceeds your remaining credit or for usage on products that aren't part of the Free Trial program.” — documentação do Google Cloud [2]

## Compatibilidade com a sua IA

A DevAI Assistant atual usa React, Express, PM2, uma API de IA externa e banco externo. Este perfil cabe em uma VM e2-micro **se** a aplicação for mantida leve: sem modelo local, sem Ollama, sem geração de vídeo local, sem múltiplos processos pesados e com limite de anexos já implementado. O uso do Gemini/Groq/OpenAI por API continua fora da VM e é o caminho correto para uma máquina desse porte.

A limitação é a memória. A e2-micro também possui apenas cerca de 1 GB de RAM, equivalendo à classe da VM Azure que travou. Portanto, a migração gratuita evita a expiração do Azure, mas exige ajustes de estabilidade antes de receber usuários: configurar swap moderado, limitar concorrência de chat para uma requisição por vez, colocar um teto de memória no PM2, registrar reinício automático e evitar tarefas de aprendizagem pesadas na própria VM.

| Aspecto | Azure B1s atual | Google e2-micro gratuita | Consequência prática |
|---|---:|---:|---|
| Memória | 1 GB | cerca de 1 GB | Não haverá ganho de memória; é indispensável limitar carga |
| Aplicação Node/PM2 | Já funciona quando a VM está saudável | Compatível | Migração direta é viável após backup |
| Modelo local de IA | Não viável | Não viável | Manter provedores por API e LM Studio somente no computador quando necessário |
| Custo contínuo | Exige reativação paga | Pode ficar em R$ 0 dentro do limite | Requer configuração rigorosa para não ultrapassar a faixa gratuita |

## Recomendação operacional

A recomendação é criar a conta no Google Cloud, ativar somente o necessário para a camada gratuita e **não iniciar migração até confirmar, na tela de criação, que a instância é e2-micro, a região é elegível, o disco é padrão e tem no máximo 30 GB**. Em seguida, configurar alertas de orçamento e desligar qualquer recurso que não seja necessário. Só então copiamos o código já salvo no GitHub, configuramos os segredos no servidor e testamos a aplicação em uma URL temporária antes de mudar o acesso do público.

A reativação do Azure não é a melhor escolha para o requisito atual de “gratuita para sempre”. Caso no futuro a IA tenha clientes simultâneos ou mais tráfego, será necessário um plano pago com 2 GB ou mais de RAM; nessa fase, a receita obtida com créditos poderá financiar uma VM melhor. Essa decisão pode ser tomada depois, sem comprometer a migração gratuita inicial.

## Próximo passo, somente após sua autorização

Eu posso abrir o cadastro do Google Cloud para você. Você preenche pessoalmente os dados de identidade e cartão na página segura; depois eu verifico cada configuração técnica antes de criar a VM. Nenhuma cobrança ou recurso pago será confirmado sem uma nova autorização explícita.

## Referências

[1]: https://cloud.google.com/products/compute "Google Cloud Compute Engine — página oficial"
[2]: https://docs.cloud.google.com/free/docs/free-cloud-features "Google Cloud Free Program — recursos gratuitos e condições"
[3]: https://cloud.google.com/free "Google Cloud Free — página oficial"
