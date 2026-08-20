import { describe, expect, it } from "vitest";
import { buildCreditBlockedPayload } from "./chatRouter";

describe("contrato de bloqueio por créditos", () => {
  it("informa ao cliente que o chat está bloqueado e preserva o saldo necessário", () => {
    expect(buildCreditBlockedPayload(false, 0, 1)).toEqual({
      content: expect.stringContaining("sem créditos"),
      creditBlocked: true,
      balance: 0,
      requiredCredits: 1,
    });
  });

  it("explica o custo do modo agente quando o saldo é insuficiente", () => {
    expect(buildCreditBlockedPayload(true, 2, 5)).toMatchObject({
      content: expect.stringContaining("modo agente (5 créditos)"),
      creditBlocked: true,
      balance: 2,
      requiredCredits: 5,
    });
  });
});
