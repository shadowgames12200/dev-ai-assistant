import { Tool } from "./llm.js";
import { ENV } from "./env.js";

export const tools: Tool[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Pesquisa na web por informações em tempo real, notícias, documentação técnica e fatos atualizados. Use esta ferramenta quando precisar de informações atualizadas ou que não estão no seu conhecimento.",
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
      description: "Executa código JavaScript/Node.js e retorna o resultado. Útil para cálculos complexos, manipulação de dados, conversões e algoritmos.",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "O código JavaScript a ser executado. O código deve retornar o resultado usando console.log() ou return.",
          },
        },
        required: ["code"],
      },
    },
  },
];

export const toolHandlers: Record<string, (args: any) => Promise<string>> = {
  web_search: async ({ query }: { query: string }) => {
    try {
      // Usar a API de busca do Google (via Serper) ou DuckDuckGo
      // Como não temos Serper, vamos usar uma abordagem com fetch direto
      const encodedQuery = encodeURIComponent(query);

      // Tentar buscar via DuckDuckGo HTML
      const response = await fetch(
        `https://duckduckgo.com/html/?q=${encodedQuery}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();

      // Extrair snippets dos resultados usando regex simples
      const results: string[] = [];

      // Procurar por títulos e snippets no HTML
      const titleRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
      const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([^<]*(?:<[^>]*>[^<]*)*)<\/a>/gi;

      let match;
      let index = 0;
      while ((match = titleRegex.exec(html)) !== null && index < 5) {
        const url = match[1];
        const title = match[2].replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
        results.push(`[${index + 1}] ${title}\nURL: ${url}`);
        index++;
      }

      // Procurar snippets
      let snippetMatch;
      index = 0;
      while ((snippetMatch = snippetRegex.exec(html)) !== null && index < results.length) {
        const snippet = snippetMatch[1].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").trim();
        if (snippet && results[index]) {
          results[index] += `\nTrecho: ${snippet}`;
        }
        index++;
      }

      if (results.length > 0) {
        return `Resultados da pesquisa para "${query}":\n\n${results.join("\n\n")}`;
      }

      // Fallback: retornar mensagem indicando que a busca foi limitada
      return `Não consegui extrair resultados detalhados da busca para "${query}". Tente reformular a pesquisa ou forneça mais detalhes sobre o que precisa.`;
    } catch (error) {
      console.error("Erro na busca web:", error);
      return `Erro ao realizar a busca web para "${query}". Tente novamente mais tarde ou reformule a pergunta.`;
    }
  },

  execute_code: async ({ code }: { code: string }) => {
    try {
      // Executar código JavaScript usando Function constructor (sandbox limitado)
      // Capturar console.log
      const logs: string[] = [];
      const sandboxConsole = {
        log: (...args: any[]) => {
          logs.push(args.map(a => typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)).join(" "));
        },
        error: (...args: any[]) => {
          logs.push("[ERRO] " + args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" "));
        },
        warn: (...args: any[]) => {
          logs.push("[AVISO] " + args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" "));
        },
      };

      // Criar função sandbox com limite de tempo
      const wrappedCode = `
        "use strict";
        const __console = sandboxConsole;
        const __timeout = 5000; // 5 segundos máximo
        let __result = undefined;
        try {
          __result = (function() {
            const console = __console;
            ${code}
          })();
        } catch(e) {
          return { error: e.message || String(e) };
        }
        return { output: __console.log.__calls || [], result: __result };
      `;

      // Usar vm module para execução segura
      const vm = await import("node:vm");
      const context = vm.createContext({
        console: sandboxConsole,
        JSON,
        Math,
        Number,
        String,
        Boolean,
        Array,
        Object,
        RegExp,
        Date,
        Map,
        Set,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        setTimeout: undefined,
        setInterval: undefined,
        fetch: undefined,
        require: undefined,
      });

      // Timeout de 5 segundos
      let timeoutId: NodeJS.Timeout | undefined;
      const script = new vm.Script(wrappedCode);

      const result = await new Promise<{ output: string[]; result: any; error?: string }>((resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Timeout: o código demorou mais de 5 segundos para executar"));
        }, 5000);

        try {
          const execResult = script.runInContext(context, { timeout: 4500 });
          clearTimeout(timeoutId);
          resolve(execResult);
        } catch (e: any) {
          clearTimeout(timeoutId);
          reject(e);
        }
      });

      const output = logs.join("\n");
      const hasResult = result?.result !== undefined && result?.result !== null;

      let response = "";
      if (output) {
        response += `Saída:\n${output}\n`;
      }
      if (hasResult) {
        const resultStr = typeof result.result === "object"
          ? JSON.stringify(result.result, null, 2)
          : String(result.result);
        response += `Resultado: ${resultStr}`;
      }
      if (result?.error) {
        response += `Erro: ${result.error}`;
      }

      return response || "Código executado sem erros (sem saída).";
    } catch (error: any) {
      console.error("Erro na execução de código:", error);
      return `Erro ao executar o código: ${error.message || "Erro desconhecido"}. Verifique a sintaxe e tente novamente.`;
    }
  },
};
