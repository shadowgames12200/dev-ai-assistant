import { describe, expect, it } from "vitest";
import {
  buildCreditBlockedMessage,
  formatCreditLabel,
  getChatCreditUiState,
  hasAvailableCredits,
  parseCreditAdjustment,
} from "./credits";

describe("apresentação de créditos no chat", () => {
  it("mostra saldo comum, saldo vazio e créditos ilimitados", () => {
    expect(formatCreditLabel({ balance: 1, unlimited: false })).toBe("1 crédito");
    expect(formatCreditLabel({ balance: 12, unlimited: false })).toBe("12 créditos");
    expect(formatCreditLabel({ balance: 0, unlimited: false })).toBe("0 créditos");
    expect(formatCreditLabel({ balance: -1, unlimited: true })).toBe("Créditos ilimitados");
  });

  it("permite chat normal somente quando há saldo ou acesso ilimitado", () => {
    expect(hasAvailableCredits({ balance: 1, unlimited: false })).toBe(true);
    expect(hasAvailableCredits({ balance: 0, unlimited: false })).toBe(false);
    expect(hasAvailableCredits({ balance: -1, unlimited: true })).toBe(true);
  });

  it("explica saldo zerado e saldo insuficiente para modo agente", () => {
    expect(buildCreditBlockedMessage(0, 1)).toContain("sem créditos");
    expect(buildCreditBlockedMessage(2, 5)).toContain("precisa de 5 créditos");
  });

  it("produz o estado visual bloqueado do chat somente quando não há saldo", () => {
    expect(getChatCreditUiState({ balance: 0, unlimited: false })).toMatchObject({
      blocked: true,
      notice: expect.stringContaining("sem créditos"),
    });
    expect(getChatCreditUiState({ balance: 50, unlimited: false })).toEqual({
      blocked: false,
      notice: null,
    });
  });

  it("valida os ajustes positivos e negativos feitos pelo administrador", () => {
    expect(parseCreditAdjustment("10", 1)).toBe(10);
    expect(parseCreditAdjustment("10", -1)).toBe(-10);
    expect(parseCreditAdjustment("0", 1)).toBeNull();
    expect(parseCreditAdjustment("1.5", 1)).toBeNull();
    expect(parseCreditAdjustment("texto", 1)).toBeNull();
  });
});
