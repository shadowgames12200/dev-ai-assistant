# Auditoria do suposto sandbox histórico

> **Conclusão curta:** existiu uma referência a “executor sandbox em Docker isolado, porta 8443” no histórico operacional, mas não há código, Dockerfile, arquivo Compose nem cliente HTTP versionado que comprove a existência de um sandbox utilizável hoje.

## Evidências examinadas

| Fonte | Resultado | Conclusão |
|---|---|---|
| `todo.md` histórico | Registra “Executor sandbox em Docker isolado (porta 8443)” | É um registro de atividade, não configuração executável |
| Commit `61be3ca` | O único arquivo alterado foi `todo.md` | O executor não foi salvo nesse commit |
| Repositório completo e versões antigas | Não contém `Dockerfile`, `docker-compose`, definição de contêiner ou serviço da porta 8443 | Não é possível restaurar o sandbox apenas fazendo checkout do Git |
| Servidor compilado histórico (`dist-server/index.js`) | Há menções ao “Docker sandbox” no prompt da IA, mas não há cliente, endpoint ou chamada para `localhost:8443` | A IA foi instruída a usar um executor, mas a integração real não foi versionada |
| `server/_core/self-improvement.ts` atual | Usa `execSync` para clonar repositório, instalar dependências, executar testes e fazer push | A execução atual acontece no processo/servidor da aplicação, não em contêiner isolado |

## Avaliação de segurança

O módulo atual pode criar diretório temporário, mas isso não equivale a isolamento. Ele compartilha sistema operacional, rede, memória, variáveis de ambiente e credenciais com a aplicação pública. Além disso, executa instalação de dependências e repete testes na mesma máquina que serve o site.

| Critério | Situação atual | Situação necessária |
|---|---|---|
| Sistema de arquivos | Diretório temporário no mesmo host | Contêiner ou máquina separada, sem acesso ao host |
| Segredos | Processo herda variáveis de ambiente | Segredos fornecidos por tarefa e com escopo mínimo |
| Recursos | Sem limite próprio de RAM, CPU e disco | Limites explícitos e encerramento automático |
| Rede | Sem política específica | Saída limitada; sem acesso à rede interna/metadata do provedor |
| GitHub | Pode alterar `origin` e fazer push em `main` | Branch temporária e pull request após aprovação final |
| Persistência | Propostas podem ficar em arquivo temporário | Banco de dados e histórico de auditoria |
| Execução de cliente | Pode consumir os recursos da IA pública | Executor descartável, separado do site |

## O que provavelmente ocorreu

O contêiner Docker foi criado diretamente na antiga VM Azure e não entrou no Git. Como a assinatura Azure expirou e a VM está pausada, não há como confirmar seu estado atual pela rede. Mesmo que ele ainda exista no disco da VM, ele não deve ser reativado sem uma auditoria, pois falta a configuração versionada e o limite de recursos não está comprovado.

## Decisão recomendada

Não habilitar a auto-melhoria atual para executar tarefas de cliente nem tratar a menção histórica como um sandbox seguro. Quando a hospedagem voltar, a implementação deve criar um executor novo, versionado e testado, com:

1. imagem Docker ou agente local documentado no repositório;
2. limite de CPU, memória, disco, tempo e rede;
3. diretório efêmero e sem montagem do host;
4. token GitHub limitado a um repositório e sem push direto na `main`;
5. duas aprovações: executar e, depois, entregar/publicar;
6. logs sem segredos e evidência dos testes.
