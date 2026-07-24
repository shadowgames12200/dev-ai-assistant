import { Tool } from "./llm.js";
import { ENV } from "./env.js";
import { executeInSandbox } from "./sandbox.js";
import { searchMemories, saveMemory } from "./semantic-memory.js";
import { multimodalTools, multimodalHandlers } from "./multimodal.js";

export const tools: Tool[] = [
  ...multimodalTools,
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Pesquisa na web por informações em tempo real, notícias, documentação técnica e fatos atualizados.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "O termo de pesquisa ou pergunta." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_js",
      description: "Executa código JavaScript/Node.js em um ambiente isolado (Sandbox Docker). Útil para cálculos, lógica e manipulação de dados.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "O código JavaScript a ser executado." },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_python",
      description: "Executa código Python em um ambiente isolado (Sandbox Docker). Útil para ciência de dados, scripts complexos e automação.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "O código Python a ser executado." },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_memories",
      description: "Busca informações relevantes no histórico de longo prazo (memória semântica). Use quando o usuário perguntar algo do passado.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "O que buscar na memória." },
          userId: { type: "number", description: "ID do usuário." },
        },
        required: ["query", "userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_fact",
      description: "Salva um fato importante sobre o usuário ou projeto na memória de longo prazo.",
      parameters: {
        type: "object",
        properties: {
          fact: { type: "string", description: "O fato a ser lembrado." },
          userId: { type: "number", description: "ID do usuário." },
        },
        required: ["fact", "userId"],
      },
    },
  },
];

export const toolHandlers: Record<string, (args: any) => Promise<string>> = {
  web_search: async ({ query }: { query: string }) => {
    try {
      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(`https://duckduckgo.com/html/?q=${encodedQuery}`, {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      
      // Extração simplificada para brevidade
      const results: string[] = [];
      const titleRegex = /<a[^>]*class="result__a"[^>]*>([^<]*)<\/a>/gi;
      let match;
      let index = 0;
      while ((match = titleRegex.exec(html)) !== null && index < 5) {
        results.push(`[${index + 1}] ${match[1]}`);
        index++;
      }
      return results.length > 0 ? `Resultados:\n${results.join("\n")}` : "Nenhum resultado encontrado.";
    } catch (error) {
      return `Erro na busca: ${error}`;
    }
  },

  execute_js: async ({ code }: { code: string }) => {
    const result = await executeInSandbox(code, "javascript");
    return formatSandboxOutput(result);
  },

  execute_python: async ({ code }: { code: string }) => {
    const result = await executeInSandbox(code, "python");
    return formatSandboxOutput(result);
  },

  search_memories: async ({ query, userId }: { query: string; userId: number }) => {
    const memories = await searchMemories(userId, query);
    if (memories.length === 0) return "Nenhuma memória relevante encontrada.";
    return memories.map(m => `- ${m.content} (Similaridade: ${(m.similarity * 100).toFixed(0)}%)`).join("\n");
  },

  save_fact: async ({ fact, userId }: { fact: string; userId: number }) => {
    const success = await saveMemory({ userId, content: fact, metadata: { source: "manual_tool" } });
    return success ? "Fato salvo com sucesso na memória de longo prazo." : "Erro ao salvar fato.";
  },
  ...multimodalHandlers,
};

function formatSandboxOutput(result: any): string {
  let output = "";
  if (result.stdout) output += `Saída:\n${result.stdout}\n`;
  if (result.stderr) output += `Erro:\n${result.stderr}\n`;
  if (result.timedOut) output += `AVISO: A execução excedeu o tempo limite.\n`;
  output += `Duração: ${result.duration}ms | Código de Saída: ${result.exitCode}`;
  return output;
}
