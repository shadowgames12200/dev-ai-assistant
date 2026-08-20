import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const approveProposal = vi.fn();

vi.mock("./_core/self-improvement", () => ({
  approveProposal,
  rejectProposal: vi.fn(),
  listProposals: vi.fn(() => []),
}));

import { appRouter } from "./routers";

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "local:owner@example.com",
      email: "owner@example.com",
      name: "Owner",
      loginMethod: "email",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("selfImprove.approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    approveProposal.mockReturnValue({ id: "proposal-1", status: "approved" });
  });

  it("aceita a chave de aprovação configurada no ambiente", async () => {
    const configuredKey = process.env.APPROVAL_KEY;
    expect(configuredKey).toBeTruthy();

    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.selfImprove.approve({
      proposalId: "proposal-1",
      approvalKey: configuredKey!,
    });

    expect(result.success).toBe(true);
    expect(approveProposal).toHaveBeenCalledWith("proposal-1");
  });
});
