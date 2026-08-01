/**
 * Model Router Module — Roteamento Dinâmico de Modelos
 * 
 * Seleciona o modelo ideal baseado na complexidade da tarefa.
 * Tarefas simples usam modelos rápidos/baratos; tarefas complexas usam modelos poderosos.
 */

export type TaskComplexity = "simple" | "medium" | "complex" | "critical";

export type ModelConfig = {
  model: string;
  maxTokens: number;
  temperature: number;
  label: string;
};

// ─── Model Registry ───

const MODELS: Record<TaskComplexity, ModelConfig> = {
  simple: {
    model: "llama-3.1-8b-instant",
    maxTokens: 1024,
    temperature: 0.7,
    label: "Fast",
  },
  medium: {
    model: "gemma2-9b-it",
    maxTokens: 2048,
    temperature: 0.6,
    label: "Balanced",
  },
  complex: {
    model: "llama-3.3-70b-versatile",
    maxTokens: 4096,
    temperature: 0.5,
    label: "Power",
  },
  critical: {
    model: "llama-3.3-70b-versatile",
    maxTokens: 8192,
    temperature: 0.3,
    label: "Critical",
  },
};

// ─── Complexity Detection ───

const SIMPLE_KEYWORDS = [
  "oi", "olá", "hello", "hi", "hey", "bom dia", "boa noite", "boa tarde",
  "obrigado", "valeu", "thanks", "tudo bem", "como vai",
  "clima", "previsão do tempo", "hora", "data", "que horas",
  "resumo", "responda sim ou não", "sim", "não", "ok", "entendi",
];

const COMPLEX_KEYWORDS = [
  "código", "programa", "desenvolver", "implementar", "bug", "erro no código",
  "arquitetura", "sistema", "banco de dados", "api", "deploy",
  "planejar", "estratégia", "análise completa", "relatório",
  "melhore", "auto-melhoria", "self-improvement",
];

const CRITICAL_KEYWORDS = [
  "[modo agente]", "[agent mode]", "modo agente",
  "execute", "rodar", "fazer push", "modificar código",
  "melhorar a ia", "melhorar o sistema",
];

/**
 * Detecta a complexidade da tarefa baseado no conteúdo da mensagem.
 */
export function detectComplexity(content: string): TaskComplexity {
  const lower = content.toLowerCase();

  // Critica primeiro (mais restritivo)
  if (CRITICAL_KEYWORDS.some(kw => lower.includes(kw))) {
    return "critical";
  }

  // Complexo
  if (COMPLEX_KEYWORDS.some(kw => lower.includes(kw))) {
    return "complex";
  }

  // Simples
  if (SIMPLE_KEYWORDS.some(kw => lower.includes(kw))) {
    return "simple";
  }

  // Heurística por tamanho da mensagem
  const wordCount = content.split(/\s+/).length;
  if (wordCount <= 10) return "simple";
  if (wordCount <= 30) return "medium";
  if (wordCount <= 80) return "complex";
  return "critical";
}

/**
 * Seleciona a configuração ideal do modelo para a tarefa.
 */
export function selectModel(complexity: TaskComplexity): ModelConfig {
  return { ...MODELS[complexity] };
}

/**
 * Seleciona o modelo baseado diretamente no conteúdo da mensagem.
 */
export function selectModelForContent(content: string): ModelConfig {
  const complexity = detectComplexity(content);
  return selectModel(complexity);
}

/**
 * Retorna estatísticas de uso dos modelos (para logging/debugging).
 */
export function getModelStats(): Record<string, number> {
  return Object.entries(MODELS).reduce((acc, [key, config]) => {
    acc[config.model] = (acc[config.model] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

/**
 * Força um modelo específico (override manual).
 */
export function forceModel(modelName: string): ModelConfig {
  for (const config of Object.values(MODELS)) {
    if (config.model === modelName) return { ...config };
  }
  // Fallback para o modelo padrão complexo
  return { ...MODELS.complex, model: modelName };
}
