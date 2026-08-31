export type AssistantMode = "kiwify" | "freelancer" | "coding" | "productivity" | "general";

export type AssistantPlan = {
  mode: AssistantMode;
  label: string;
  instructions: string;
  knowledge: string;
};

const KNOWLEDGE_BASE = `
BASE DE CONHECIMENTO OPERACIONAL (referência geral; confirme detalhes atuais na plataforma):
- Kiwify: ajude a criar produtos digitais simples, entregáveis e honestos, como guias, checklists, templates e mini-aulas. Diferencie hipótese de mercado de fato verificado. Não prometa vendas.
- Kiwify: entregue título, público, promessa responsável, sumário, conteúdo, preço de teste, descrição, copy de página e checklist de publicação quando solicitado.
- 99Freelas: ajude a entender o briefing, separar entregáveis, premissas, exclusões, perguntas indispensáveis, proposta e critérios de aceite. Não envie proposta nem fale com cliente sem confirmação explícita.
- Código: explique a causa, proponha a menor correção verificável, mostre arquivos afetados, testes e riscos. Não alegue que executou algo sem evidência.
- Produtividade: transforme objetivos em próximos passos pequenos, checklist, prioridades e critérios de conclusão.
`;

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

export function detectAssistantMode(content: string): AssistantMode {
  const text = content.toLowerCase();
  if (includesAny(text, ["kiwify", "produto digital", "ebook", "e-book", "infoproduto", "vender online"])) return "kiwify";
  if (includesAny(text, ["99freelas", "freela", "freelance", "proposta para cliente", "briefing do cliente", "trabalho para cliente"])) return "freelancer";
  if (includesAny(text, ["código", "codigo", "bug", "erro", "typescript", "javascript", "react", "python", "api", "programação", "programacao"])) return "coding";
  if (includesAny(text, ["organizar", "produtividade", "rotina", "planejamento", "checklist", "tarefas", "cronograma"])) return "productivity";
  return "general";
}

const MODE_INSTRUCTIONS: Record<AssistantMode, string> = {
  kiwify: `MODO CRIADOR KIWIFY: trate o pedido como produto próprio do usuário. Faça no máximo uma pergunta opcional depois de entregar uma primeira versão concreta. Entregue algo utilizável no mesmo turno: conceito, público, título, promessa sem garantia, sumário, conteúdo inicial completo, preço de teste, descrição, copy de página, checklist e próximos passos. Marque como RASCUNHO quando faltar informação específica. Não recuse só porque o usuário é iniciante.`,
  freelancer: `MODO FREELANCER: ajude a analisar o anúncio, montar proposta e organizar uma entrega verificável. Pergunte apenas o que muda escopo, prazo, preço, privacidade ou aceite. Separe inclusões, exclusões, premissas, riscos e critérios de aceite. Não envie proposta, não contate cliente e não publique nada sem confirmação explícita.`,
  coding: `MODO DESENVOLVIMENTO: responda com diagnóstico, causa provável, correção mínima, arquivos afetados, comandos de teste e limitações. Se houver código suficiente, produza uma implementação concreta; não fique apenas em recomendações genéricas.`,
  productivity: `MODO PRODUTIVIDADE: transforme o objetivo em um plano curto e executável, com ordem, prioridade, tempo aproximado condicionado e critério de pronto.`,
  general: `MODO GERAL: responda diretamente, use o contexto já fornecido e peça somente dados indispensáveis. Quando o usuário pedir uma entrega, entregue uma primeira versão concreta antes de fazer perguntas opcionais.`,
};

export function buildConversationMemory(messages: Array<{ role?: string; content?: string }>, maxMessages = 18): string {
  const recent = messages
    .filter((message) => typeof message.content === "string" && message.content.trim())
    .slice(-maxMessages)
    .map((message) => `${message.role === "assistant" ? "IA" : "Usuário"}: ${message.content!.trim()}`)
    .join("\n");
  return recent ? `MEMÓRIA CURTA DA CONVERSA (use para não repetir perguntas):\n${recent}` : "";
}

export function buildAssistantPlan(content: string, history: Array<{ role?: string; content?: string }>): AssistantPlan {
  const mode = detectAssistantMode(content);
  return {
    mode,
    label: mode === "kiwify" ? "Criador Kiwify" : mode === "freelancer" ? "Freelancer" : mode === "coding" ? "Desenvolvimento" : mode === "productivity" ? "Produtividade" : "Geral",
    instructions: MODE_INSTRUCTIONS[mode],
    knowledge: `${KNOWLEDGE_BASE}\n\n${buildConversationMemory(history)}`,
  };
}

export function buildStructuredResponseInstruction(mode: AssistantMode): string {
  if (mode === "kiwify") return "Formato preferido: decisão recomendada, produto, público, conteúdo pronto, oferta, copy, checklist e pendências.";
  if (mode === "freelancer") return "Formato preferido: briefing, lacunas indispensáveis, escopo, proposta, riscos e critérios de aceite.";
  if (mode === "coding") return "Formato preferido: diagnóstico, solução, código/arquivos, testes, riscos e próximos passos.";
  if (mode === "productivity") return "Formato preferido: objetivo, prioridades, passos, checklist e critério de conclusão.";
  return "Formato preferido: resposta direta, premissas, entrega e próximos passos.";
}

export function buildAssistantContext(content: string, history: Array<{ role?: string; content?: string }>): { plan: AssistantPlan; systemMessage: string } {
  const plan = buildAssistantPlan(content, history);
  return {
    plan,
    systemMessage: `ORQUESTRADOR DE PEDIDO\nModo detectado: ${plan.label}\n${plan.instructions}\n${buildStructuredResponseInstruction(plan.mode)}\n\n${plan.knowledge}`,
  };
}
