import { beforeEach, describe, expect, it, vi } from "vitest";

const createProposalFromLearningQueue = vi.fn();

vi.mock("./_core/self-improvement", () => ({
  createProposalFromLearningQueue,
}));

describe("triagem semanal de aprendizagem", () => {
  beforeEach(() => {
    createProposalFromLearningQueue.mockReset();
  });

  it("não cria nada quando não há oportunidades pendentes", async () => {
    createProposalFromLearningQueue.mockResolvedValue(null);
    const { runWeeklyLearningTriage } = await import("./weeklyLearningTriage");

    await expect(runWeeklyLearningTriage()).resolves.toEqual({ created: false });
  });

  it("retorna apenas a identificação de uma proposta pendente", async () => {
    createProposalFromLearningQueue.mockResolvedValue({ id: "imp_weekly_safe", status: "pending" });
    const { runWeeklyLearningTriage } = await import("./weeklyLearningTriage");

    await expect(runWeeklyLearningTriage()).resolves.toEqual({
      created: true,
      proposalId: "imp_weekly_safe",
    });
  });
});
