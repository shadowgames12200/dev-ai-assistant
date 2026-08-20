import { createProposalFromLearningQueue } from "./_core/self-improvement";

export type WeeklyLearningTriageResult = {
  created: boolean;
  proposalId?: string;
};

/**
 * Executa uma triagem limitada da fila de aprendizagem. Não pesquisa a web,
 * não chama modelos, não altera código e não aprova propostas. A operação é
 * idempotente porque só consome oportunidades que ainda estejam pendentes.
 */
export async function runWeeklyLearningTriage(): Promise<WeeklyLearningTriageResult> {
  const proposal = await createProposalFromLearningQueue();

  if (!proposal) {
    return { created: false };
  }

  return { created: true, proposalId: proposal.id };
}
