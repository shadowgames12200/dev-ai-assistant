import { describe, expect, it } from "vitest";
import {
  buildAssistantContext,
  buildConversationMemory,
  detectAssistantMode,
} from "./assistantOrchestrator";

describe("assistantOrchestrator", () => {
  it("detecta o modo Kiwify", () => {
    expect(detectAssistantMode("Crie um produto digital para vender na Kiwify")).toBe("kiwify");
  });

  it("detecta o modo freelancer", () => {
    expect(detectAssistantMode("Analise este projeto do 99Freelas e monte uma proposta")).toBe("freelancer");
  });

  it("detecta desenvolvimento e produtividade", () => {
    expect(detectAssistantMode("Corrija este bug em React")).toBe("coding");
    expect(detectAssistantMode("Organize minha rotina em um checklist")).toBe("productivity");
  });

  it("mantém memória curta com histórico recente", () => {
    const memory = buildConversationMemory([
      { role: "user", content: "Meu público é iniciante" },
      { role: "assistant", content: "Vou considerar linguagem simples" },
    ]);
    expect(memory).toContain("Meu público é iniciante");
    expect(memory).toContain("Vou considerar linguagem simples");
  });

  it("manda o modo Kiwify entregar uma primeira versão concreta", () => {
    const result = buildAssistantContext("Crie algo para vender na Kiwify", []);
    expect(result.plan.mode).toBe("kiwify");
    expect(result.systemMessage).toContain("primeira versão concreta");
    expect(result.systemMessage).toContain("Não prometa vendas");
  });

  it("mantém confirmações para ações externas no modo freelancer", () => {
    const result = buildAssistantContext("Prepare uma proposta para um projeto do 99Freelas", []);
    expect(result.plan.mode).toBe("freelancer");
    expect(result.systemMessage).toContain("Não envie proposta");
  });
});
