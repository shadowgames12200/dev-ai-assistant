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
Se for um ZIP, liste todo o conteúdo e destaque os arquivos importantes.`;

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
});

export type AppRouter = typeof appRouter;
