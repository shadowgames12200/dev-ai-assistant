import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConversationForUser: vi.fn(),
  getMessages: vi.fn(),
  addMessage: vi.fn(),
  getUserCredits: vi.fn(),
  invokeLLMStream: vi.fn(),
  readLLMStreamContent: vi.fn(),
}));

vi.mock("./db", () => ({
  getConversationForUser: mocks.getConversationForUser,
  getMessages: mocks.getMessages,
  addMessage: mocks.addMessage,
  getUserCredits: mocks.getUserCredits,
}));

vi.mock("./_core/llm", () => ({
  invokeLLMStream: mocks.invokeLLMStream,
  readLLMStreamContent: mocks.readLLMStreamContent,
}));

async function getRouter() {
  const { appRouter } = await import("./routers");
  return appRouter;
}

function adminCaller() {
  return getRouter().then(appRouter => appRouter.createCaller({
    req: { protocol: "https", headers: {} } as any,
    res: {} as any,
    user: { id: 1, openId: "local:owner@example.com", email: "owner@example.com", role: "admin" } as any,
  }));
}

describe("workflow profissional no chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConversationForUser.mockResolvedValue({ id: 41, userId: 1 });
    mocks.getMessages.mockResolvedValue([]);
    mocks.addMessage.mockResolvedValue(undefined);
    mocks.getUserCredits.mockResolvedValue(10);
    mocks.invokeLLMStream.mockResolvedValue({});
    mocks.readLLMStreamContent.mockResolvedValue("Resposta técnica sem segredos.");
  });

  it("bloqueia briefing de planilha incompleto antes de consultar o LLM", async () => {
    const caller = await adminCaller();
    const result = await caller.chat.send({
      conversationId: 41,
      content: "Crie uma planilha de controle financeiro em Excel e entregue ao cliente.",
    });

    expect(result).toEqual({ success: true, warning: "project_triage_blocked" });
    expect(mocks.invokeLLMStream).not.toHaveBeenCalled();
    expect(mocks.addMessage).toHaveBeenLastCalledWith(
      41,
      1,
      "assistant",
      expect.stringContaining("EXECUÇÃO BLOQUEADA"),
    );
  });

  it("marca mensagens como não confiáveis e filtra a resposta antes de persistir", async () => {
    const caller = await adminCaller();
    mocks.getMessages.mockResolvedValueOnce([
      { role: "user", content: "Explique os princípios de tipagem em TypeScript.", metadata: null },
    ]);
    mocks.readLLMStreamContent.mockResolvedValueOnce("Resposta: token: ghp_1234567890abcdefghijklmnop");

    const result = await caller.chat.send({
      conversationId: 41,
      content: "Explique os princípios de tipagem em TypeScript.",
    });

    expect(result).toEqual({ success: true });
    expect(mocks.invokeLLMStream).toHaveBeenCalledTimes(1);
    const request = mocks.invokeLLMStream.mock.calls[0][0];
    expect(request.messages[1].content).toContain("INÍCIO DE MENSAGEM NÃO CONFIÁVEL");
    expect(mocks.addMessage).toHaveBeenLastCalledWith(
      41,
      1,
      "assistant",
      expect.not.stringContaining("ghp_1234567890abcdefghijklmnop"),
    );
  });
});
