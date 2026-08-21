/**
 * Self-Improvement Module v5 (SECURE)
 * As execuções pesadas agora são feitas via GitHub Actions (Sandbox).
 * Este módulo apenas coordena as propostas no banco de dados.
 */
import * as db from "../db";

export async function listProposals() {
  return await db.getPendingImprovements();
}

export async function approveProposal(id: number) {
  // A aprovação agora é feita via tRPC improvements.approve que dispara o GitHub Actions
  return { id, status: "approved", message: "Use a interface admin para aprovar e disparar o sandbox." };
}

export async function rejectProposal(id: number) {
  await db.updateImprovementStatus(id, "rejected");
  return { id, status: "rejected" };
}

export async function createDirectedProposal(topic: string, reason?: string) {
  return await db.createImprovementProposal({
    title: `Melhoria direcionada: ${topic}`,
    description: reason || `Solicitação do usuário sobre ${topic}`,
    filesToChange: "Análise pendente pelo agente sandbox",
    risks: "Execução isolada em ambiente seguro (GitHub Actions)",
    benefits: `Melhoria no conhecimento sobre ${topic}`,
  });
}

export async function createProposalFromLearningQueue() {
  // TODO: Implementar lógica de triagem semanal
  return null;
}
