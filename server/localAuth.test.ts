import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const passwordStore = new Map<string, { passwordHash: string; salt: string }>();

function buildFakeClient() {
  return {
    query: async (sql: string, params?: any[]) => {
      if (/SELECT passwordHash, salt FROM password_credentials/.test(sql)) {
        const record = passwordStore.get(String(params?.[0] || ""));
        return [record ? [record] : []];
      }
      if (/INSERT INTO password_credentials/.test(sql)) {
        passwordStore.set(String(params?.[0] || ""), { passwordHash: String(params?.[1]), salt: String(params?.[2]) });
        return [{ affectedRows: 1 }];
      }
      return [[]];
    },
  } as any;
}

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn(),
    getUserByOpenId: vi.fn(),
    getUserByLoginIdentifier: vi.fn(),
    upsertUser: vi.fn(),
    createLocalAccount: vi.fn(),
    updateLocalAccount: vi.fn(),
  };
});

vi.mock("./_core/sdk", () => ({
  sdk: {
    createSessionToken: vi.fn(),
    authenticateRequest: vi.fn(),
  },
}));

vi.mock("./_core/env", () => ({ ENV: { ownerOpenId: "local:charleshenriquegonsalves05@gmail.com" } }));

import { handleLocalAccountUpdate, handleLocalLogin, handleLocalLogout, handleLocalRegister } from "./localAuth";
import * as db from "./db";
import { sdk } from "./_core/sdk";

function makeReq(body: any, protocol: "http" | "https" = "https"): any {
  return { body, protocol, headers: {} };
}

function makeRes() {
  const cookieCalls: any[] = [];
  return {
    res: {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      cookie: (name: string, value: string, options: any) => cookieCalls.push({ name, value, options }),
      clearCookie: vi.fn(),
    },
    cookieCalls,
  };
}

const sampleUser = {
  id: 41,
  openId: "local:test@example.com",
  name: "teste",
  email: "test@example.com",
  loginMethod: "email",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function hashed(password: string, salt: string) {
  return createHmac("sha256", salt).update(password).digest("hex");
}

describe("autenticação local", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    passwordStore.clear();
    vi.mocked(db.getDb).mockResolvedValue(buildFakeClient());
    vi.mocked(db.getUserByOpenId).mockResolvedValue(sampleUser);
    vi.mocked(db.upsertUser).mockResolvedValue(undefined);
    vi.mocked(sdk.createSessionToken).mockResolvedValue("session-de-teste");
    vi.mocked(sdk.authenticateRequest).mockResolvedValue(sampleUser as any);
  });

  it("rejeita login sem identificador e senha", async () => {
    const { res } = makeRes();
    await handleLocalLogin(makeReq({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("não cria conta automaticamente ao tentar entrar", async () => {
    vi.mocked(db.getUserByLoginIdentifier).mockResolvedValue(null);
    const { res } = makeRes();
    await handleLocalLogin(makeReq({ identifier: "desconhecido", password: "segredo123" }), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(db.createLocalAccount).not.toHaveBeenCalled();
  });

  it("aceita login por nome de usuário com senha válida", async () => {
    const salt = "salt-de-teste";
    passwordStore.set(sampleUser.email, { passwordHash: hashed("segredo123", salt), salt });
    vi.mocked(db.getUserByLoginIdentifier).mockResolvedValue(sampleUser);
    const { res, cookieCalls } = makeRes();
    await handleLocalLogin(makeReq({ identifier: "Teste", password: "segredo123" }, "http"), res);
    expect(db.getUserByLoginIdentifier).toHaveBeenCalledWith("Teste");
    expect(sdk.createSessionToken).toHaveBeenCalledWith(sampleUser.openId, expect.any(Object));
    expect(cookieCalls[0].options).toMatchObject({ secure: false, sameSite: "lax", httpOnly: true });
  });

  it("rejeita senha incorreta sem revelar se o identificador existe", async () => {
    passwordStore.set(sampleUser.email, { passwordHash: "hash-inválido", salt: "salt" });
    vi.mocked(db.getUserByLoginIdentifier).mockResolvedValue(sampleUser);
    const { res } = makeRes();
    await handleLocalLogin(makeReq({ identifier: sampleUser.email, password: "segredo123" }), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Nome de usuário/e-mail ou senha inválidos" });
  });

  it("cria uma conta somente pelo endpoint de cadastro", async () => {
    const created = { ...sampleUser, name: "Nova Conta", email: "nova@example.com", openId: "local:nova@example.com" };
    vi.mocked(db.createLocalAccount).mockResolvedValue(created);
    const { res, cookieCalls } = makeRes();
    await handleLocalRegister(makeReq({ name: "Nova Conta", email: "nova@example.com", password: "segredo123" }), res);
    expect(db.createLocalAccount).toHaveBeenCalledWith(expect.objectContaining({ name: "Nova Conta", email: "nova@example.com", role: "user" }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(cookieCalls).toHaveLength(1);
  });

  it("bloqueia cadastro com nome ou e-mail duplicado", async () => {
    vi.mocked(db.createLocalAccount).mockResolvedValue(null);
    const { res } = makeRes();
    await handleLocalRegister(makeReq({ name: "Conta Usada", email: "usada@example.com", password: "segredo123" }), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("limita cadastros repetidos da mesma origem antes de criar conta adicional", async () => {
    vi.mocked(db.createLocalAccount).mockResolvedValue(null);
    const request = {
      body: { name: "Conta Limitada", email: "limitada@example.com", password: "segredo123" },
      protocol: "https",
      headers: {},
      ip: "198.51.100.77",
    };

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const { res } = makeRes();
      await handleLocalRegister(request, res);
      expect(res.status).toHaveBeenCalledWith(409);
    }

    const { res: limitedResponse } = makeRes();
    await handleLocalRegister(request, limitedResponse);

    expect(limitedResponse.status).toHaveBeenCalledWith(429);
    expect(db.createLocalAccount).toHaveBeenCalledTimes(10);
  });

  it("exige a senha atual para alterar a conta", async () => {
    passwordStore.set(sampleUser.email, { passwordHash: hashed("senha-correta", "salt"), salt: "salt" });
    const { res } = makeRes();
    await handleLocalAccountUpdate(makeReq({ name: "Novo Nome", email: "novo@example.com", currentPassword: "senha-errada" }), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(db.updateLocalAccount).not.toHaveBeenCalled();
  });

  it("atualiza a conta e emite sessão para a nova identidade", async () => {
    passwordStore.set(sampleUser.email, { passwordHash: hashed("senha-correta", "salt"), salt: "salt" });
    const updated = { ...sampleUser, name: "Nome Novo", email: "novo@example.com", openId: "local:novo@example.com" };
    vi.mocked(db.updateLocalAccount).mockResolvedValue({ status: "updated", user: updated });
    const { res, cookieCalls } = makeRes();
    await handleLocalAccountUpdate(makeReq({ name: "Nome Novo", email: "novo@example.com", currentPassword: "senha-correta", newPassword: "senha-nova" }), res);
    expect(db.updateLocalAccount).toHaveBeenCalledWith(expect.objectContaining({ openId: sampleUser.openId, name: "Nome Novo", email: "novo@example.com" }));
    expect(sdk.createSessionToken).toHaveBeenCalledWith(updated.openId, expect.any(Object));
    expect(cookieCalls).toHaveLength(1);
  });
});

describe("encerramento de sessão", () => {
  it("limpa o cookie da sessão", async () => {
    const { res } = makeRes();
    await handleLocalLogout(makeReq({}), res);
    expect(res.clearCookie).toHaveBeenCalledWith("app_session_id", expect.objectContaining({ maxAge: 0 }));
  });
});
