/**
 * Tool Selector Module — Seleção Dinâmica de Ferramentas
 * 
 * Analisa a intenção do usuário e seleciona apenas as ferramentas relevantes
 * para a tarefa atual, reduzindo tokens de contexto e minimizando alucinações.
 */

export type ToolCategory =
  | "search"
  | "code_execution"
  | "memory"
  | "file_operations"
  | "automation"
  | "multimodal"
  | "self_improvement"
  | "shell";

export type ToolDefinition = {
  name: string;
  category: ToolCategory;
  description: string;
};

// ─── Tool Registry (aligned with tools.ts) ───

const TOOL_REGISTRY: ToolDefinition[] = [
  { name: "web_search", category: "search", description: "Pesquisa na web por informações em tempo real" },
  { name: "execute_js", category: "code_execution", description: "Executa código JavaScript/Node.js" },
  { name: "execute_python", category: "code_execution", description: "Executa código Python" },
  { name: "execute_shell", category: "shell", description: "Executa comandos Shell/Bash" },
  { name: "execute_js_with_packages", category: "code_execution", description: "Executa JavaScript com pacotes npm" },
  { name: "execute_python_with_packages", category: "code_execution", description: "Executa Python com pacotes pip" },
  { name: "search_memories", category: "memory", description: "Busca memórias semânticas relevantes" },
  { name: "save_fact", category: "memory", description: "Salva um fato importante na memória" },
  { name: "stark_system", category: "automation", description: "Casa inteligente e status do sistema" },
  { name: "analyze_file", category: "file_operations", description: "Analisa conteúdo de arquivos binários/texto" },
  { name: "generate_image", category: "multimodal", description: "Gera imagens a partir de texto (DALL-E)" },
  { name: "self_improvement", category: "self_improvement", description: "Propõe e executa melhorias no próprio código" },
];

// ─── Intent Keywords ───

const INTENT_KEYWORDS: Record<ToolCategory, string[]> = {
  search: [
    "pesquisar", "pesquisa", "search", "buscar", "procurar", "encontrar",
    "informação", "notícias", "documento", "referência", "fontes",
    "o que é", "quem é", "quando", "onde", "como funciona",
    "atualizado", "recente", "novo",
  ],
  code_execution: [
    "código", "programa", "script", "calcular", "matemática", "número",
    "execute", "rodar código", "testar código", "funciona", "bug",
    "algoritmo", "fórmula", "conversão", "dados", "json", "api",
  ],
  memory: [
    "lembre", "memória", "memorize", "salve", "lembrar", "facto",
    "fato", "preference", "preferência", "informação sobre",
    "contexto", "histórico", "passado",
  ],
  file_operations: [
    "arquivo", "file", "documento", "ler arquivo", "escrever",
    "salvar arquivo", "upload", "download", "pasta", "diretório",
  ],
  automation: [
    "automatizar", "automação", "agendar", "rotina", "tarefa",
    "stark", "stark module", "home automation", "casa", "dispositivo",
  ],
  multimodal: [
    "imagem", "gerar imagem", "foto", "picture", "visual",
    "analisar imagem", "descrever", "reconhecimento",
  ],
  self_improvement: [
    "melhore", "melhoria", "auto-melhoria", "self-improvement",
    "melhore a ia", "melhore o sistema", "upgrade", "evolução",
    "jarvis", "friday", "sexta-feira",
  ],
  shell: [
    "comando", "terminal", "shell", "bash", "instalar", "install",
    "sistema", "processo", "linux", "configurar",
  ],
};

// ─── Tool Selection Logic ───

/**
 * Detecta as categorias de ferramentas relevantes para uma mensagem.
 */
export function detectToolCategories(content: string): ToolCategory[] {
  const lower = content.toLowerCase();
  const matchedCategories = new Set<ToolCategory>();

  for (const [category, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        matchedCategories.add(category as ToolCategory);
        break;
      }
    }
  }

  // Sempre incluir memory (para contexto) e search (fallback)
  if (matchedCategories.size === 0) {
    matchedCategories.add("memory");
    matchedCategories.add("search");
  }

  // Se é self-improvement, incluir shell e code_execution
  if (matchedCategories.has("self_improvement")) {
    matchedCategories.add("shell");
    matchedCategories.add("code_execution");
    matchedCategories.add("file_operations");
  }

  return Array.from(matchedCategories);
}

/**
 * Seleciona as ferramentas relevantes para uma mensagem.
 * Retorna os nomes das ferramentas que devem ser injetadas.
 */
export function selectTools(content: string, allTools: any[]): any[] {
  const categories = detectToolCategories(content);

  return allTools.filter((tool: any) => {
    const toolName = tool.name || tool.function?.name;
    const registry = TOOL_REGISTRY.find(t => t.name === toolName);
    if (!registry) return true; // Incluir ferramentas não catalogadas
    return categories.includes(registry.category);
  });
}

/**
 * Seleciona ferramentas para o agent loop (mais permissivo).
 */
export function selectToolsForAgent(goal: string, allTools: any[]): any[] {
  // Para agentes, ser mais permissivo mas ainda filtrar completamente irrelevantes
  const categories = detectToolCategories(goal);

  // Adicionar categorias extras para o modo agente
  categories.push("code_execution", "shell");

  return allTools.filter((tool: any) => {
    const toolName = tool.name || tool.function?.name;
    const registry = TOOL_REGISTRY.find(t => t.name === toolName);
    if (!registry) return true;
    return categories.includes(registry.category);
  });
}

/**
 * Gera um resumo de quais ferramentas foram selecionadas e por quê.
 */
export function explainToolSelection(content: string): string {
  const categories = detectToolCategories(content);
  const selectedTools = TOOL_REGISTRY.filter(t => categories.includes(t.category));

  const parts: string[] = [];
  for (const tool of selectedTools) {
    parts.push(`- ${tool.name}: ${tool.description}`);
  }

  return `Ferramentas selecionadas para esta tarefa (${categories.join(", ")}):\n${parts.join("\n")}`;
}
