import { describe, expect, it } from "vitest";
import { buildCreditBlockedMessage } from "../client/src/lib/credits";

describe("contrato de bloqueio por créditos", () => {
  it("informa ao cliente que o chat está bloqueado quando o saldo é zero", () => {
    expect(buildCreditBlockedMessage(0, 1)).toContain("sem créditos");
  });

  it("explica o custo da tarefa quando o saldo é insuficiente", () => {
    expect(buildCreditBlockedMessage(2, 5)).toContain("precisa de 5 créditos");
  });
});
