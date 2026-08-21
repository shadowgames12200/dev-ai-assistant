import { createProposalFromLearningQueue } from "./_core/self-improvement";

export type WeeklyLearningTriageResult = {
  created: boolean;
  proposalId?: number;
};

/**
 * Executa uma triagem limitada da fila de aprendizagem.
 */
export async function runWeeklyLearningTriage(): Promise<WeeklyLearningTriageResult> {
  const proposal = await createProposalFromLearningQueue();

  if (!proposal) {
    return { created: false };
  }

  return { created: true, proposalId: (proposal as any).id };
}
