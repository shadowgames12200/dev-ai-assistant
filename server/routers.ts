import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { systemRouter } from "./_core/systemRouter.js";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db.js";
import { invokeGroq } from "./_core/groq.js";
import { storagePut } from "./storage.js";
import { analyzeBinaryFile, detectFileTypeByHeader, isTextFile, isImageFile, extractTextFromBuffer } from "./_core/file-analyzer.js";
import { selfImprove, analyzeForImprovements, executeSystemCommand, type SelfImprovementResult } from "./_core/self-improvement.js";

const SYSTEM_PROMPT = `Você é o DevAI, um assistente de programação e produtividade extremamente competente.
Responda de forma clara, concisa e direta.

Você pode analisar:
- **Imagens**: Descreva o que vê, identifique código, diagramas, erros na tela, etc.
- **Código-fonte**: Analise, corrija bugs, sugira melhorias, explique a lógica
- **Documentos de texto**: Resuma, analise, extraia informações
- **Arquivos ZIP**: Liste o conteúdo, identifique executáveis, código e configurações
- **Executáveis (.exe, .dll, ELF)**: Analise as strings, identifique arquitetura, detecte comportamento
- **PDFs**: Extraia texto e analise o conteúdo
- **Arquivos de configuração**: Analise configs, .env, YAML, JSON, etc.
- **Logs**: Identifique erros, warnings e padrões

Quando o usuário enviar um arquivo, analise-o completamente.
Se for código, sugira melhorias e corrija bugs.
Se for uma imagem, descreva o que vê em detalhes.
Se for um arquivo binário/executável, analise as strings e identifique o propósito.
Se for um ZIP, liste todo o conteúdo e destaque os arquivos importantes.

=== AUTO-MELHORIA ===
Você TEM a capacidade de melhorar a si mesma. Quando:
1. O usuário pedir para melhorar algo
2. Você identificar que uma funcionalidade está faltando ou com bug
3. Você detectar que pode otimizar algum processo

Você DEVE usar a ferramenta de self-improvement. O processo é:
1. Analisar o que precisa ser melhorado
2. Planejar as mudanças necessárias
3. Implementar as mudanças
4. Testar 5 vezes para garantir estabilidade
5. Só aplicar se TODOS os 5 testes passarem

NUNCA aplique mudanças sem testar. Segurança é prioridade.
Se um teste falhar, reverta e informe o usuário sobre o problema encontrado.`;

function truncateMessagesForContext(messages: any[], maxContentLength: number = 200000): any[] {
  let totalLength = 0;
  const truncated = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    totalLength += content.length;
    if (totalLength <= maxContentLength) {
      truncated.unshift(msg);
    } else {
      break;
    }
  }

  return truncated;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    login: publicProcedure
      .input(z.object({ username: z.string(), password: z.string() }))
      .mutation(async () => {
        throw new TRPCError({ code: "FORBIDDEN" });
      }),
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      // @ts-ignore
      const cookieOptions = getSessionCookieOptions(ctx.req);
      // @ts-ignore
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  conversations: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      return db.getUserConversations(ctx.user.id);
    }),
    create: protectedProcedure
      .input(z.object({ title: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const id = await db.createConversation(ctx.user.id, input.title ?? "Nova");
        return { id, title: input.title };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await db.deleteConversation(input.id, ctx.user.id);
        return { success: true };
      }),
    rename: protectedProcedure
      .input(z.object({ id: z.number(), title: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await db.updateConversationTitle(input.id, input.title);
        return { success: true };
      }),
    messages: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const conv = await db.getConversation(input.id, ctx.user.id);
        if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
        return db.getConversationMessages(input.id);
      }),
  }),

  upload: router({
    uploadFile: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        fileName: z.string(),
        fileContent: z.string(), // base64
        fileType: z.string(),
        userMessage: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const { conversationId, fileName, fileContent, fileType, userMessage } = input;
        const buffer = Buffer.from(fileContent, "base64");

        // Salvar o arquivo no storage
        let fileUrl = "";
        try {
          const res = await storagePut(fileName, buffer, fileType);
          fileUrl = res.url;
        } catch (storageErr) {
          console.warn("[Upload] Storage save failed, continuing without fileUrl:", (storageErr as Error).message);
        }

        const isImage = isImageFile(fileType);
        const isText = isTextFile(fileName, fileType);

        // Construir o conteúdo da mensagem do usuário
        let content: string;
        if (isImage) {
          content = `${userMessage || ""}\n[Imagem anexada: ${fileName}]`;
        } else if (isText) {
          const text = extractTextFromBuffer(buffer, fileName, fileType);
          content = `${userMessage || ""}\n[Arquivo: ${fileName}]\n\nConteúdo:\n\`\`\`\n${text}\n\`\`\``;
        } else {
          // Para arquivos binários: usar o file-analyzer
          const analysis = analyzeBinaryFile(buffer, fileName, fileType);
          content = `${userMessage || ""}\n\n${analysis}`;
        }

        // Salvar mensagem do usuário
        await db.addMessage(conversationId, "user", content, fileUrl, fileName);

        // Obter histórico da conversa
        const history = await db.getConversationMessages(conversationId);

        // Truncar mensagens antigas se necessário
        const truncatedHistory = truncateMessagesForContext(history);

        try {
          // Construir mensagens para o Groq
          const groqMessages: any[] = [
            { role: "system", content: SYSTEM_PROMPT }
          ];

          for (const msg of truncatedHistory) {
            if (msg.role === "system") continue;

            if (msg.role === "user" && isImage && msg.fileName === fileName) {
              // Para a última mensagem de usuário que contém a imagem, usar vision
              const imageText = userMessage || "Analise esta imagem e me diga o que você vê. Se for um código, explique o que ele faz.";
              groqMessages.push({
                role: "user",
                content: [
                  { type: "text", text: imageText },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${fileType};base64,${fileContent}`,
                      detail: "high",
                    },
                  },
                ],
              });
            } else {
              groqMessages.push({
                role: msg.role,
                content: msg.content,
              });
            }
          }

          // Usar o modelo de visão se for imagem, senão usar o modelo padrão
          const model = isImage ? "qwen/qwen3.6-27b" : "llama-3.3-70b-versatile";

          const response = await invokeGroq({
            model,
            messages: groqMessages,
            maxTokens: 4000,
            temperature: 0.7,
          });

          const aiMsg = response.choices[0]?.message?.content || "Desculpe, não consegui gerar uma resposta.";
          await db.addMessage(conversationId, "assistant", aiMsg);
        } catch (err) {
          console.error("[Upload] Groq invocation error:", err);
          await db.addMessage(conversationId, "assistant", `Desculpe, ocorreu um erro ao processar o arquivo: ${(err as Error).message}`);
        }

        return { success: true, messages: await db.getConversationMessages(conversationId) };
      }),
  }),

  chat: router({
    send: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        content: z.string(),
        useAdvancedReasoning: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await db.addMessage(input.conversationId, "user", input.content);
        const history = await db.getConversationMessages(input.conversationId);

        // Truncar mensagens antigas se necessário
        const truncatedHistory = truncateMessagesForContext(history);

        try {
          // Construir mensagens para o Groq
          const groqMessages: any[] = [
            { role: "system", content: SYSTEM_PROMPT }
          ];

          for (const msg of truncatedHistory) {
            if (msg.role === "system") continue;
            groqMessages.push({
              role: msg.role,
              content: msg.content,
            });
          }

          const model = input.useAdvancedReasoning
            ? "llama-3.3-70b-versatile"
            : "llama-3.3-70b-versatile";

          const response = await invokeGroq({
            model,
            messages: groqMessages,
            maxTokens: 4000,
            temperature: 0.7,
          });

          const aiMsg = response.choices[0]?.message?.content || "Desculpe, não consegui gerar uma resposta.";
          await db.addMessage(input.conversationId, "assistant", aiMsg);
        } catch (err) {
          console.error("[Chat] Groq invocation error:", err);
          await db.addMessage(input.conversationId, "assistant", `Desculpe, ocorreu um erro ao processar sua solicitação: ${(err as Error).message}`);
        }

        return { success: true, messages: await db.getConversationMessages(input.conversationId) };
      }),
  }),

  // ─── Self-Improvement Router ───
  selfImprove: router({
    /**
     * Analisar o repositório e sugerir melhorias necessárias
     */
    analyze: protectedProcedure.mutation(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

      try {
        const improvements = await analyzeForImprovements();
        await db.addMessage(
          1, // Usar primeira conversa ou criar uma de sistema
          "assistant",
          `📋 **Análise de Auto-Melhoria Concluída**\n\n${improvements.length > 0
            ? improvements.map(imp => `- **${imp.area}**: ${imp.description}`).join("\n")
            : "Nenhuma melhoria necessária encontrada no momento."
          }`
        );
        return { success: true, improvements };
      } catch (err) {
        console.error("[SelfImprove] Analysis error:", err);
        return { success: false, improvements: [], error: (err as Error).message };
      }
    }),

    /**
     * Executar uma melhoria no código (clone → melhorar → testar 5x → push se passar)
     */
    execute: protectedProcedure
      .input(z.object({
        description: z.string().describe("Descrição da melhoria a ser implementada"),
        files: z.array(z.object({
          path: z.string().describe("Caminho do arquivo no repositório"),
          content: z.string().describe("Conteúdo completo do arquivo corrigido"),
        })),
        tests: z.array(z.string()).describe("Comandos de teste a serem executados").optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

        // Registrar que começou a melhoria
        const statusMsg = `🔧 **Iniciando Auto-Melhoria**\n\n**Melhoria:** ${input.description}\n**Arquivos a modificar:** ${input.files.map(f => f.path).join(", ")}\n**Testes:** ${input.tests?.join(", ") || "build + test padrão"}\n\nExecutando em segundo plano...`;
        await db.addMessage(1, "assistant", statusMsg);

        try {
          // Executar o self-improvement
          const result = await selfImprove(
            {
              area: "Auto-improvement",
              description: input.description,
              filesToChange: input.files.map(f => f.path),
              testsNeeded: input.tests || [],
            },
            input.files
          );

          // Registrar resultado
          const resultMsg = result.success
            ? `✅ **Auto-Melhoria Concluída com Sucesso!**\n\n${result.message}\n\n**Testes executados:** ${result.testResults.length}/${result.testResults.length} passes\n${result.testResults.map(r => `- Tentativa ${r.run}: ${r.passed ? "✅ Passou" : "❌ Falhou"}`).join("\n")}`
            : `❌ **Auto-Melhoria Falhou**\n\n${result.message}\n\n**Testes executados:**\n${result.testResults.map(r => `- Tentativa ${r.run}: ${r.passed ? "✅ Passou" : "❌ Falhou"}`).join("\n")}\n\nMudanças foram revertidas para proteger o repositório.`;

          await db.addMessage(1, "assistant", resultMsg);

          return { success: result.success, result } as const;
        } catch (err) {
          const errorMsg = `💥 **Erro Fatal na Auto-Melhoria**\n\n${(err as Error).message}\n\nNenhuma mudança foi aplicada.`;
          await db.addMessage(1, "assistant", errorMsg);
          return { success: false, error: (err as Error).message } as const;
        }
      }),

    /**
     * Executar comando do sistema (para análise de arquivos)
     */
    executeCommand: protectedProcedure
      .input(z.object({
        command: z.string().describe("Comando do sistema a ser executado"),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

        // Whitelist de comandos seguros
        const safeCommands = ["file", "strings", "hexdump", "unzip", "ls", "cat", "head", "tail", "wc", "grep", "find", "du", "stat"];
        const cmdParts = input.command.split(/\s+/);
        const baseCmd = cmdParts[0];

        if (!safeCommands.includes(baseCmd)) {
          return {
            success: false,
            output: "",
            error: `Comando não permitido: ${baseCmd}. Comandos permitidos: ${safeCommands.join(", ")}`,
          } as const;
        }

        try {
          const result = executeSystemCommand(input.command, undefined, 30000);
          return {
            success: result.exitCode === 0,
            output: result.stdout.slice(0, 5000),
            error: result.stderr.slice(0, 2000),
          } as const;
        } catch (err) {
          return {
            success: false,
            output: "",
            error: (err as Error).message,
          } as const;
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
