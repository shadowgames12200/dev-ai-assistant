import { describe, expect, it, vi, beforeEach } from "vitest";

// In-memory password store shared by getPasswordRecord/setPasswordRecord in localAuth.ts
const passwordStore = new Map<string, { passwordHash: string; salt: string }>();

// Function declaration (hoisted, safe inside vi.mock factory)
function buildFakeClient() {
  return {
    session: {
      client: {
        query: async (sql: string, params?: any[]) => {
          if (/SELECT passwordHash, salt FROM password_credentials/.test(sql)) {
            const rec = passwordStore.get(params?.[0]);
            return rec ? [[rec]] : [[]];
          }
          if (/INSERT INTO password_credentials/.test(sql)) {
            passwordStore.set(params![0], { passwordHash: params![1], salt: params![2] });
            return [];
          }
          return [[]];
        },
      },
    },
  } as any;
}

// Mock db module
vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserByOpenId: vi.fn(),
    upsertUser: vi.fn().mockResolvedValue(undefined),
    getDb: vi.fn().mockResolvedValue(buildFakeClient()),
  };
});

// Mock sdk module
vi.mock("./_core/sdk", () => ({
  sdk: {
    createSessionToken: vi.fn().mockResolvedValue("mock-jwt-token"),
  },
}));

// Mock env so isOwnerEmail recognizes the owner's email
vi.mock("./_core/env", () => ({
  ENV: {
    ownerOpenId: "local:charleshenriquegonsalves05@gmail.com",
  },
}));

import { handleLocalLogin } from "./localAuth";
import * as db from "./db";
import { sdk } from "./_core/sdk";
import { getPasswordRecord } from "./localAuth";

function makeReq(body: any): any {
  return { body, protocol: "https", headers: {} };
}

function makeRes(): { res: any; cookieCalls: any[] } {
  const cookieCalls: any[] = [];
  return {
    res: {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      cookie: (name: string, value: string, opts: any) => cookieCalls.push({ name, value, opts }),
      clearCookie: vi.fn(),
    },
    cookieCalls,
  };
}

const sampleUser = {
  id: 1,
  openId: "local:test@example.com",
  name: "test",
  email: "test@example.com",
  loginMethod: "email",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

describe("handleLocalLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sdk.createSessionToken).mockResolvedValue("mock-jwt-token");
    vi.mocked(db.upsertUser).mockResolvedValue(undefined);
    vi.mocked(db.getUserByOpenId).mockResolvedValue(sampleUser);
    vi.mocked(db.getDb).mockResolvedValue(buildFakeClient());
    passwordStore.clear();
  });

  it("rejects login with missing email or password", async () => {
    const { res } = makeRes();
    await handleLocalLogin(makeReq({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "E-mail e senha são obrigatórios" });
  });

  it("rejects login with password shorter than 6 characters", async () => {
    const { res } = makeRes();
    await handleLocalLogin(makeReq({ email: "a@b.com", password: "12345" }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("rejects login with invalid email format", async () => {
    const { res } = makeRes();
    await handleLocalLogin(makeReq({ email: "a@", password: "secret123" }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("auto-registers a new user, mints a session token and returns the user", async () => {
    const { res, cookieCalls } = makeRes();
    await handleLocalLogin(makeReq({ email: "new@example.com", password: "secret123" }), res);
    expect(await getPasswordRecord("new@example.com")).toBeTruthy();
    expect(db.upsertUser).toHaveBeenCalled();
    expect(sdk.createSessionToken).toHaveBeenCalled();
    expect(cookieCalls.length).toBe(1);
    expect(cookieCalls[0].value).toBe("mock-jwt-token");
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        user: expect.objectContaining({ email: "test@example.com" }),
      })
    );
  });

  it("rejects wrong password for an existing email user", async () => {
    passwordStore.set("existing@example.com", { passwordHash: "definitelynottherighthash", salt: "abc" });
    const { res } = makeRes();
    await handleLocalLogin(makeReq({ email: "existing@example.com", password: "secret123" }), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Email ou senha inválidos" });
    expect(sdk.createSessionToken).not.toHaveBeenCalled();
  });

  it("marks the owner email as admin", async () => {
    vi.mocked(db.getUserByOpenId).mockImplementation(async (openId: string) =>
      openId?.includes("charleshenriquegonsalves05")
        ? { ...sampleUser, openId: "local:charleshenriquegonsalves05@gmail.com", email: "charleshenriquegonsalves05@gmail.com", role: "admin" }
        : sampleUser
    );
    const { res } = makeRes();
    await handleLocalLogin(makeReq({ email: "charleshenriquegonsalves05@gmail.com", password: "secret123" }), res);
    expect(db.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: "admin" })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ role: "admin" }) })
    );
  });
});

describe("handleLocalLogout", () => {
  it("clears the session cookie", async () => {
    const { handleLocalLogout } = await import("./localAuth");
    const res = { clearCookie: vi.fn(), json: vi.fn() };
    await handleLocalLogout(makeReq({}), res as any);
    expect(res.clearCookie).toHaveBeenCalledWith("app_session_id", expect.objectContaining({ maxAge: 0 }));
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});
