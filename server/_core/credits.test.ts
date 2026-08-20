import { describe, expect, it } from "vitest";
import {
  AGENT_COST_PER_MESSAGE,
  getCostPerMessage,
  setCostPerMessage,
  usesMySqlCreditPersistence,
} from "./credits";

describe("configuração de custo de créditos", () => {
  it("expõe o custo normal configurável e o custo fixo do modo agente", () => {
    const initialCost = getCostPerMessage();

    expect(typeof initialCost).toBe("number");
    expect(initialCost).toBeGreaterThanOrEqual(0);
    expect(AGENT_COST_PER_MESSAGE).toBe(5);
  });

  it("limita o custo normal a um valor seguro para o painel administrativo", () => {
    const originalCost = getCostPerMessage();

    setCostPerMessage(125);
    expect(getCostPerMessage()).toBe(100);

    setCostPerMessage(-8);
    expect(getCostPerMessage()).toBe(0);

    setCostPerMessage(originalCost);
  });

  it("usa a persistência JSON por padrão e só tenta MySQL quando a opção é explícita", () => {
    expect(usesMySqlCreditPersistence()).toBe(false);
    expect(usesMySqlCreditPersistence("json")).toBe(false);
    expect(usesMySqlCreditPersistence("mysql")).toBe(true);
  });
});
