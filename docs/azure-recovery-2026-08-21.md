# Diagnóstico de disponibilidade da VM Azure — 21/08/2026

- A aplicação em `http://20.89.48.89:3000/login` e `http://20.89.48.89:3000/chat` não respondeu (HTTP 000).
- A porta TCP 3000 permaneceu aberta, mas o SSH não concluiu o banner, indicando que o sistema operacional não está atendendo normalmente.
- O Portal Azure foi acessado com a conta do proprietário.
- A página inicial do portal informou que o período de avaliação gratuita expirou e que os serviços estão pausados.
- Ao abrir a VM `Devaiassistant`, o Portal Azure retornou erro interno do controle de recursos (`VirtualMachineEntityCache`, HTTP 400), impedindo a visualização normal e uma reinicialização pelo blade da VM.
- Nenhuma alteração de cobrança, upgrade, reinicialização ou outro comando de infraestrutura foi executado.

## Próximo passo seguro

Confirmar com o proprietário antes de iniciar qualquer ação que possa gerar cobrança. Se a assinatura estiver bloqueada pelo fim da avaliação, será necessário regularizar o estado da assinatura no Azure antes de a VM poder voltar a responder.
