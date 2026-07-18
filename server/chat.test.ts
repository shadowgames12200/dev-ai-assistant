import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers.js";
import { COOKIE_NAME } from "../shared/const.js";
import type { TrpcContext } from "./_core/context.js";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });
});

describe("auth.me", () => {
  it("returns the authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result).toBeDefined();
    expect(result?.name).toBe("Sample User");
    expect(result?.email).toBe("sample@example.com");
    expect(result?.role).toBe("user");
  });
});

describe("app router structure", () => {
  it("has conversations router", () => {
    expect(appRouter).toBeDefined();
    // Verify the router has the expected nested routers
    const routerDef = appRouter._def.procedures;
    const keys = Object.keys(routerDef);
    // Should have auth, conversations, messages, chat, and system
    expect(keys.some(k => k.includes("auth"))).toBe(true);
    expect(keys.some(k => k.includes("conversations"))).toBe(true);
    expect(keys.some(k => k.includes("messages"))).toBe(true);
    expect(keys.some(k => k.includes("chat"))).toBe(true);
  });

  it("has chat.send mutation", () => {
    const procedures = appRouter._def.procedures;
    const chatSendKey = Object.keys(procedures).find(k => k.includes("chat.send"));
    expect(chatSendKey).toBeDefined();
  });

  it("has conversations.create mutation", () => {
    const procedures = appRouter._def.procedures;
    const createKey = Object.keys(procedures).find(k => k.includes("conversations.create"));
    expect(createKey).toBeDefined();
  });

  it("has conversations.delete mutation", () => {
    const procedures = appRouter._def.procedures;
    const deleteKey = Object.keys(procedures).find(k => k.includes("conversations.delete"));
    expect(deleteKey).toBeDefined();
  });

  it("has conversations.rename mutation", () => {
    const procedures = appRouter._def.procedures;
    const renameKey = Object.keys(procedures).find(k => k.includes("conversations.rename"));
    expect(renameKey).toBeDefined();
  });

  it("has messages.list query", () => {
    const procedures = appRouter._def.procedures;
    const listKey = Object.keys(procedures).find(k => k.includes("messages.list"));
    expect(listKey).toBeDefined();
  });
});
