import { Tool } from "./llm.js";

export const tools: Tool[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Pesquisa na web por informações em tempo real, notícias, documentação técnica e fatos atualizados.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "O termo de pesquisa ou pergunta para buscar na web.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_code",
      description: "Executa código Python em um ambiente seguro e retorna o resultado. Útil para cálculos complexos, análise de dados ou teste de algoritmos.",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "O código Python a ser executado.",
          },
        },
        required: ["code"],
      },
    },
  },
];

// Mock handlers for now - these will be replaced with real implementations
export const toolHandlers: Record<string, (args: any) => Promise<string>> = {
  web_search: async ({ query }) => {
    try {
      // Usando o endpoint de busca da Manus API que já está configurado no projeto
      const response = await fetch("https://forge.manus.im/v1/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          queries: [query],
          type: "info"
        }),
      });

      if (!response.ok) throw new Error("Falha na busca web");
      const data = await responseon();
      
      // Formatar os resultados para a IA
      if (data.results && data.results.length > 0) {
        return data.results.map((r: any) => `Fonte: ${r.url}\nConteúdo: ${r.snippet}`).join("\n\n");
      }
      return "Nenhum resultado relevante encontrado para esta pesquisa.";
    } catch (error) {
      console.error("Erro na busca web:", error);
      return "Erro ao realizar a busca web. Tente novamente mais tarde.";
    }
  },
  execute_code: async ({ code }) => {
    try {
      // Usando o endpoint de execução de código da Manus API
      const response = await fetch("https://forge.manus.im/v1/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          language: "python",
          code: code
        }),
      });

      if (!response.ok) throw new Error("Falha na execução de código");
      const data = await responseon();
      
      return `Saída do código:\n${data.stdout || ""}\n${data.stderr ? "Erros:\n" + data.stderr : ""}`;
    } catch (error) {
      console.error("Erro na execução de código:", error);
      return "Erro ao executar o código. Verifique a sintaxe e tente novamente.";
    }
  },
};
