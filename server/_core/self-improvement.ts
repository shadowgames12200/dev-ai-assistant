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
  const dbInstance = await db.getDb();
  const { learningOpportunities, selfImprovements } = await import("../../drizzle/schema");
  const { eq, and } = await import("drizzle-orm");

  // Buscar oportunidades pendentes
  const opportunities = await dbInstance
    .select()
    .from(learningOpportunities)
    .where(eq(learningOpportunities.status, "pending"))
    .limit(5);

  if (opportunities.length === 0) return null;

  const topics = opportunities.map((o: any) => o.topic).join(", ");
  
  // Criar uma proposta consolidada
  const [proposal] = await dbInstance.insert(selfImprovements).values({
    title: `Triagem Semanal: Aprendizado Consolidado`,
    description: `Melhoria baseada nas interações recentes sobre: ${topics}`,
    filesToChange: "Múltiplos arquivos (definidos pelo Agente Sandbox)",
    risks: "Execução isolada em GitHub Actions",
    benefits: "Expansão da base de conhecimento e correção de padrões de erro.",
    status: "pending"
  }).returning();

  // Marcar oportunidades como processadas
  for (const opt of opportunities) {
    await dbInstance
      .update(learningOpportunities)
      .set({ status: "processed" })
      .where(eq(learningOpportunities.id, opt.id));
  }

  return proposal;
}
