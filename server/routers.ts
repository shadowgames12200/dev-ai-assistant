import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { systemRouter } from "./_core/systemRouter.js";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db.js";
import { invokeGroq, buildGroqUserMessage } from "./_core/groq.js";
import { storagePut } from "./storage.js";

const SYSTEM_PROMPT = `Você é o DevAI, um assistente de programação e produtividade extremamente competente.
Responda de forma clara, concisa e direta.
Quando o usuário enviar um arquivo (imagem, código, documento, etc.), analise-o completamente e forneça feedback detalhado.
Você pode analisar imagens, código-fonte, arquivos de texto, logs, documentos e muito mais.
Se o arquivo for código, sugira melhorias, corrija bugs e explique o que está acontecendo.
Se o arquivo for uma imagem, descreva o que vê e forneça insights relevantes.
Se o arquivo for um documento ou texto, resuma, analise e forneça recomendações.`;

// Extensões de arquivos de texto que podem ser lidos como texto puro
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "json", "xml", "yaml", "yml",
  "toml", "ini", "env", "log", "sh", "bash",
  "js", "jsx", "ts", "tsx", "mjs", "cjs",
  "py", "rb", "php", "java", "kt", "scala",
  "c", "cpp", "h", "hpp", "cs", "go", "rs",
  "swift", "dart", "lua", "r", "sql", "graphql",
  "html", "htm", "css", "scss", "vue", "svelte",
  "dockerfile", "makefile", "gitignore", "toml", "cfg", "conf",
]);

// Tipos MIME de imagens suportados pelo modelo de visão do Groq
const IMAGE_MIME_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/bmp", "image/svg+xml",
]);

function isTextFile(fileName: string, fileType: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return fileType.startsWith("text/") ||
    fileType === "application/json" ||
    fileType === "application/javascript" ||
    fileType === "application/typescript" ||
    TEXT_EXTENSIONS.has(ext);
}

function isImageFile(fileType: string): boolean {
  return IMAGE_MIME_TYPES.has(fileType.toLowerCase());
}

function extractTextFromBuffer(buffer: Buffer, fileName: string, fileType: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const isText = isTextFile(fileName, fileType);

  if (isText) {
    const text = buffer.toString("utf-8");
    return text.length > 80000 ? text.slice(0, 80000) + "\n\n[... conteúdo truncado ...]" : text;
  }

  // Para PDFs, tentar extrair texto básico (se vier como texto)
  if (fileType === "application/pdf" || ext === "pdf") {
    return "[Arquivo PDF anexado - conteúdo binário não pode ser lido diretamente como texto. O modelo de visão pode analisá-lo se convertido em imagem.]";
  }

  return `[Arquivo binário: ${fileName} (${fileType || 'tipo desconhecido'})]`;
}

function truncateMessagesForContext(messages: any[], maxContentLength: number = 200000): any[] {
  // Remove system messages from history (we'll inject a fresh one)
  // Truncate old messages if the total content is too large
  let totalLength = 0;
  const truncated = [];

  // Always include the last few messages to maintain context
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
        // Verify ownership
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
          // Para imagens: embutir como texto descritivo + base64 data URI
          content = `${userMessage || ""}\n[Imagem anexada: ${fileName}]`;
        } else if (isText) {
          const text = extractTextFromBuffer(buffer, fileName, fileType);
          content = `${userMessage || ""}\n[Arquivo: ${fileName}]\n\nConteúdo:\n\`\`\`\n${text}\n\`\`\``;
        } else {
          // Para outros binários
          content = `${userMessage || ""}\n[Arquivo binário: ${fileName} (${(buffer.length / 1024).toFixed(1)} KB)]\nEste é um arquivo binário. O que você gostaria que eu analisasse sobre ele?`;
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
