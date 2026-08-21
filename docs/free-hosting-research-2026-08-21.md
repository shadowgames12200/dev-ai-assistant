# Pesquisa de hospedagem gratuita permanente — 21/08/2026

## Google Cloud Free Tier

>A documentação oficial do Google Cloud informa que a camada gratuita disponibiliza uso sem custo de produtos selecionados dentro de limites mensais e inclui Compute Engine. A mesma documentação diferencia essa camada contínua do crédito de US$ 300 válido por 90 dias.

A documentação também esclarece que uma conta de faturamento é necessária para acessar a camada gratuita e que o método de pagamento é usado para validação de identidade. O valor de autorização temporária indicado pode ficar entre US$ 0,00 e US$ 1,00; não é uma cobrança final. Depois de ativada uma conta de faturamento, haverá cobrança apenas se o uso exceder os limites gratuitos ou utilizar produtos fora deles.

| Fonte oficial | Constatação registrada |
|---|---|
| [Página Free do Google Cloud](https://cloud.google.com/free) | Há mais de 20 produtos com camada gratuita, incluindo Compute Engine, sujeitos a limites mensais. |
| [Documentação de recursos gratuitos](https://docs.cloud.google.com/free/docs/free-cloud-features) | Distingue créditos de 90 dias da camada gratuita contínua; exige conta de faturamento e alerta sobre cobranças por excedente. |
| [Compute Engine](https://cloud.google.com/products/compute) | O produto é uma VM Linux capaz de hospedar aplicações web e servidores Node.js. |

## Alternativas descartadas como VM permanente sem custo

AWS mantém serviços sempre gratuitos, mas a oferta de EC2/VM para conta nova não deve ser tratada como VM gratuita permanente: a própria documentação diferencia limites promocionais e ofertas que vencem. Azure, na conta já consultada, exibiu avaliação gratuita expirada e serviços pausados.

## Implicação inicial para o projeto

O Google Cloud é a única alternativa oficial encontrada até este ponto, fora da Oracle Cloud, que oferece uma modalidade contínua e gratuita apropriada para uma VM pequena. Ainda é necessário confirmar, na documentação específica do Compute Engine, o tipo de máquina elegível, as regiões permitidas, os limites de disco e tráfego, antes de recomendar uma migração.
