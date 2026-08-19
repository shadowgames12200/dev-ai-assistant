import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "./chatRouter";

describe("SYSTEM_PROMPT - protocolo profissional de freelancer", () => {
  it("proíbe inventar dados e exige confirmação dos fatos", () => {
    expect(SYSTEM_PROMPT).toContain("Use APENAS os dados");
    expect(SYSTEM_PROMPT).toContain("É proibido inventar ou completar por conta própria");
    expect(SYSTEM_PROMPT).toContain("Nunca apresente suposição como fato");
  });

  it("exige perguntas e impede chamar de final uma entrega incompleta", () => {
    expect(SYSTEM_PROMPT).toContain("Faça perguntas objetivas");
    expect(SYSTEM_PROMPT).toContain("NÃO declare a entrega como pronta");
    expect(SYSTEM_PROMPT).toContain("versão final pronta para entregar");
  });

  it("bloqueia a entrega final e evita valores genéricos quando faltam dados", () => {
    expect(SYSTEM_PROMPT).toContain("GATE DE SEGURANÇA");
    expect(SYSTEM_PROMPT).toContain("Dados necessários antes da versão final");
    expect(SYSTEM_PROMPT).toContain("RASCUNHO BLOQUEADO — NÃO ENVIAR");
    expect(SYSTEM_PROMPT).toContain('"Escola Estadual"');
  });

  it("exige checagem de entrega e transparência sobre arquivos", () => {
    expect(SYSTEM_PROMPT).toContain("Checagem de entrega");
    expect(SYSTEM_PROMPT).toContain("NÃO envie ao cliente antes de confirmar os itens pendentes");
    expect(SYSTEM_PROMPT).toContain("Não afirme que criou um arquivo");
  });

  it("inclui o ciclo avançado de planejamento, evidências e revisão crítica", () => {
    expect(SYSTEM_PROMPT).toContain("Protocolo avançado de execução verificável");
    expect(SYSTEM_PROMPT).toContain("entender → planejar → executar → verificar → revisar criticamente → apresentar");
    expect(SYSTEM_PROMPT).toContain("dado fornecido");
    expect(SYSTEM_PROMPT).toContain("fato verificado");
    expect(SYSTEM_PROMPT).toContain("Confiança calibrada");
    expect(SYSTEM_PROMPT).toContain("Revisão adversarial");
    expect(SYSTEM_PROMPT).toContain("Aprendizagem com aprovação");
  });
});
