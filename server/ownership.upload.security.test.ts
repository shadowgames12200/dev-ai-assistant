import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConversationForUser: vi.fn(),
  getMessages: vi.fn(),
  addMessage: vi.fn(),
  getUserCredits: vi.fn(),
  getDb: vi.fn(),
  storagePut: vi.fn(),
}));

vi.mock("./db", () => ({
  getConversationForUser: mocks.getConversationForUser,
  getMessages: mocks.getMessages,
  addMessage: mocks.addMessage,
  getUserCredits: mocks.getUserCredits,
  getDb: mocks.getDb,
}));

vi.mock("./storage", () => ({
  storagePut: mocks.storagePut,
  storageGetSignedUrl: vi.fn(),
}));

async function getRouter() {
  const { appRouter } = await import("./routers");
  return appRouter;
}

function callerFor(userId: number) {
  return getRouter().then(appRouter => appRouter.createCaller({
    req: { protocol: "https", headers: {} } as any,
    res: {} as any,
    user: { id: userId, openId: `local:user${userId}@example.com`, email: `user${userId}@example.com`, role: "user" } as any,
  }));
}

describe("isolamento horizontal de conversas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConversationForUser.mockResolvedValue(null);
    mocks.getMessages.mockResolvedValue([]);
    mocks.getUserCredits.mockResolvedValue(10);
  });

  it("não permite que B liste mensagens da conversa de A", async () => {
    const caller = await callerFor(2);

    await expect(caller.chat.conversations.messages({ id: 41 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.getConversationForUser).toHaveBeenCalledWith(41, 2);
    expect(mocks.getMessages).not.toHaveBeenCalled();
  });

  it("não permite que B consulte anexos da conversa de A", async () => {
    const caller = await callerFor(2);

    await expect(caller.chat.conversations.attachments({ conversationId: 41 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.getConversationForUser).toHaveBeenCalledWith(41, 2);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("não permite que B envie mensagem para a conversa de A", async () => {
    const caller = await callerFor(2);

    await expect(caller.chat.send({ conversationId: 41, content: "mensagem não autorizada" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.getConversationForUser).toHaveBeenCalledWith(41, 2);
    expect(mocks.addMessage).not.toHaveBeenCalled();
    expect(mocks.getUserCredits).not.toHaveBeenCalled();
  });

  it("não permite que B faça upload na conversa de A", async () => {
    const caller = await callerFor(2);

    await expect(caller.upload.file({
      conversationId: 41,
      fileName: "briefing.txt",
      fileType: "text/plain",
      base64: "aGVsbG8=",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.getConversationForUser).toHaveBeenCalledWith(41, 2);
    expect(mocks.storagePut).not.toHaveBeenCalled();
  });
});

describe("limites e isolamento do upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConversationForUser.mockResolvedValue({ id: 41, userId: 9 });
    mocks.storagePut.mockResolvedValue({ key: "uploads/9/41/generated.txt", url: "/manus-storage/uploads/9/41/generated.txt" });
  });

  it("rejeita path traversal, MIME não permitido e Base64 inválido antes do storage", async () => {
    const caller = await callerFor(9);

    await expect(caller.upload.file({ conversationId: 41, fileName: "../secret.txt", fileType: "text/plain", base64: "aGVsbG8=" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.upload.file({ conversationId: 41, fileName: "malware.exe", fileType: "application/x-msdownload", base64: "aGVsbG8=" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.upload.file({ conversationId: 41, fileName: "bad.txt", fileType: "text/plain", base64: "not_base64" })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mocks.storagePut).not.toHaveBeenCalled();
  });

  it("rejeita arquivo maior que 10 MB antes do storage", async () => {
    const caller = await callerFor(10);
    const oversizedBase64 = "A".repeat(14_000_000);

    await expect(caller.upload.file({
      conversationId: 41,
      fileName: "large.txt",
      fileType: "text/plain",
      base64: oversizedBase64,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.storagePut).not.toHaveBeenCalled();
  });

  it("isola a chave do storage por usuário e conversa, sem usar o nome original", async () => {
    const caller = await callerFor(9);

    const result = await caller.upload.file({
      conversationId: 41,
      fileName: "client.ts",
      fileType: "text/plain",
      base64: "aGVsbG8=",
    });

    expect(result.success).toBe(true);
    expect(mocks.storagePut).toHaveBeenCalledTimes(1);
    const [storageKey, bytes, contentType] = mocks.storagePut.mock.calls[0];
    expect(storageKey).toMatch(/^uploads\/9\/41\/[0-9a-f-]{36}\.ts$/);
    expect(storageKey).not.toContain("client.ts");
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(contentType).toBe("text/plain");
  });
});
