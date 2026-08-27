import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => {
  const owner = {
    id: 1,
    openId: "local:owner@example.com",
    name: "Owner",
    email: "owner@example.com",
    loginMethod: "email",
    role: "admin" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const client = {
    id: 2,
    openId: "local:client@example.com",
    name: "Client",
    email: "client@example.com",
    loginMethod: "email",
    role: "user" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const otherAdmin = {
    id: 3,
    openId: "local:admin@example.com",
    name: "Other Admin",
    email: "admin@example.com",
    loginMethod: "email",
    role: "admin" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    owner,
    client,
    otherAdmin,
    balances: new Map<number, number>([
      [1, 0],
      [2, 25],
      [3, 50],
    ]),
    abuseCases: [],
    users: new Map<number, any>([
      [owner.id, owner],
      [client.id, client],
      [otherAdmin.id, otherAdmin],
    ]),
    getAllUsers: vi.fn(async () => Array.from(dbState.users.values())),
    getUserById: vi.fn(async (id: number) => dbState.users.get(id) || null),
    getUserCredits: vi.fn(async (id: number) => dbState.balances.get(id) || 0),
    addCredits: vi.fn(async (id: number, amount: number) => {
      dbState.balances.set(id, (dbState.balances.get(id) || 0) + amount);
    }),
    updateUserRole: vi.fn(async (id: number, role: "user" | "admin") => {
      const user = dbState.users.get(id);
      if (!user) return null;
      user.role = role;
      return user;
    }),
    deleteUserAccount: vi.fn(async (id: number) => dbState.users.delete(id)),
    permanentlyBlockUser: vi.fn(async (id: number, reason: string) => {
      const user = dbState.users.get(id);
      if (user) user.accountStatus = "blocked";
      return user || null;
    }),
    clearUserBlock: vi.fn(async (id: number) => {
      const user = dbState.users.get(id);
      if (user) user.accountStatus = "active";
      return user || null;
    }),
    getAbuseCases: vi.fn(async () => dbState.abuseCases),
  };
});

vi.mock("./db", () => dbState);

async function getRouter() {
  process.env.APPROVAL_KEY = "approval-test-key";
  process.env.OWNER_OPEN_ID = "local:owner@example.com";
  const { appRouter } = await import("./routers");
  return appRouter;
}

function context(user: any) {
  return {
    req: { protocol: "https", headers: {} } as any,
    res: {} as any,
    user,
  };
}

describe("proteções administrativas", () => {
  beforeEach(() => {
    dbState.balances.set(1, 0);
    dbState.balances.set(2, 25);
    dbState.balances.set(3, 50);
    dbState.client.role = "user";
    dbState.otherAdmin.role = "admin";
    dbState.users.set(1, dbState.owner);
    dbState.users.set(2, dbState.client);
    dbState.users.set(3, dbState.otherAdmin);
    dbState.abuseCases.length = 0;
    vi.clearAllMocks();
  });

  it("não devolve o openId bruto no painel", async () => {
    const appRouter = await getRouter();
    const result = await appRouter.createCaller(context(dbState.owner)).admin.listUsers();

    expect(result).toHaveLength(3);
    expect(result.find((user) => user.id === 1)?.isOwner).toBe(true);
    expect(result[0]).not.toHaveProperty("openId");
  });

  it("exige senha e frase para créditos e não altera créditos do proprietário", async () => {
    const appRouter = await getRouter();
    const caller = appRouter.createCaller(context(dbState.owner));

    await expect(caller.admin.adjustCredits({
      userId: 2,
      amount: 10,
      approvalKey: "wrong",
      confirmation: "CONFIRMAR",
    })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const ownerResult = await caller.admin.adjustCredits({
      userId: 1,
      amount: 100,
      approvalKey: "approval-test-key",
      confirmation: "CONFIRMAR",
    });

    expect(ownerResult).toMatchObject({ success: true, skipped: true });
    expect(dbState.balances.get(1)).toBe(0);
  });

  it("aplica créditos em lote somente às contas selecionadas e válidas", async () => {
    const appRouter = await getRouter();
    const result = await appRouter.createCaller(context(dbState.owner)).admin.adjustCreditsBatch({
      userIds: [1, 2, 2],
      amount: 10,
      approvalKey: "approval-test-key",
      confirmation: "CONFIRMAR",
    });

    expect(result.updatedUserIds).toEqual([1, 2]);
    expect(dbState.balances.get(1)).toBe(0);
    expect(dbState.balances.get(2)).toBe(35);
    expect(dbState.addCredits).toHaveBeenCalledTimes(1);
  });

  it("impede um administrador comum de alterar o cargo ou excluir o proprietário", async () => {
    const appRouter = await getRouter();
    const caller = appRouter.createCaller(context(dbState.otherAdmin));

    await expect(caller.admin.setRoles({
      userIds: [1],
      role: "user",
      approvalKey: "approval-test-key",
      confirmation: "CONFIRMAR",
      ownerOverride: false,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(caller.admin.deleteUsers({
      userIds: [1],
      approvalKey: "approval-test-key",
      confirmation: "EXCLUIR CONTAS",
      ownerOverride: false,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(dbState.deleteUserAccount).not.toHaveBeenCalled();
  });

  it("bloqueia e desbloqueia uma conta selecionada com senha e frase próprias", async () => {
    const appRouter = await getRouter();
    const caller = appRouter.createCaller(context(dbState.owner));

    await caller.admin.blockUsers({ userIds: [2], reason: "Abuso confirmado", approvalKey: "approval-test-key", confirmation: "BLOQUEAR CONTAS" });
    expect(dbState.permanentlyBlockUser).toHaveBeenCalledWith(2, "Abuso confirmado", 1);
    expect(dbState.client.accountStatus).toBe("blocked");

    await caller.admin.unblockUsers({ userIds: [2], note: "Revisão aprovada", approvalKey: "approval-test-key", confirmation: "DESBLOQUEAR CONTAS" });
    expect(dbState.clearUserBlock).toHaveBeenCalledWith(2, 1, "Revisão aprovada");
    expect(dbState.client.accountStatus).toBe("active");
  });

  it("nunca permite bloquear a conta proprietária", async () => {
    const appRouter = await getRouter();
    const caller = appRouter.createCaller(context(dbState.owner));

    await expect(caller.admin.blockUsers({ userIds: [1], reason: "Teste", approvalKey: "approval-test-key", confirmation: "BLOQUEAR CONTAS" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbState.permanentlyBlockUser).not.toHaveBeenCalled();
  });

  it("promove uma conta selecionada somente após senha e confirmação", async () => {
    const appRouter = await getRouter();
    const result = await appRouter.createCaller(context(dbState.owner)).admin.setRoles({
      userIds: [2],
      role: "admin",
      approvalKey: "approval-test-key",
      confirmation: "CONFIRMAR",
      ownerOverride: false,
    });

    expect(result.updatedUserIds).toEqual([2]);
    expect(dbState.updateUserRole).toHaveBeenCalledWith(2, "admin");
  });
});
