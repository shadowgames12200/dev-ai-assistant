import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { systemRouter } from "./_core/systemRouter.js";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db.js";
import { invokeLLM, Message } from "./_core/llm.js";
import { storagePut } from "./storage.js";
import { tools, toolHandlers } from "./_core/tools.js";

const SYSTEM_PROMPT = `Você é o DevAI, um assistente ultra-rápido e técnico.
Responda de forma concisa, direta e sem enrolação.
Se o usuário enviar um arquivo, analise o conteúdo embutido diretamente.`;

function extractTextFromBuffer(buffer: Buffer, fileName: string, fileType: string): string {
  const textExtensions = ["txt", "md", "json", "js", "ts", "tsx", "py", "html", "css", "sql", "yaml", "yml"];
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const isText = fileType.startsWith("text/") || textExtensions.includes(ext);

  if (isText) {
    const text = buffer.toString("utf-8");
    return text.length > 100000 ? text.slice(0, 100000) + "..." : text;
  }
  return `[Arquivo: ${fileName}]`;
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
  }),

  upload: router({
    uploadFile: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        fileName: z.string(),
        fileContent: z.string(),
        fileType: z.string(),
        userMessage: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const { conversationId, fileName, fileContent, fileType, userMessage } = input;
        const buffer = Buffer.from(fileContent, "base64");
        const text = extractTextFromBuffer(buffer, fileName, fileType);
        
        let fileUrl = "";
        try {
          const res = await storagePut(fileName, buffer, fileType);
          fileUrl = res.url;
        } catch {}

        const content = `${userMessage || ""} [Arquivo: ${fileName}]\n\nConteúdo:\n${text}`;
        await db.addMessage(conversationId, "user", content, fileUrl, fileName);
        
        const history = await db.getConversationMessages(conversationId);
        const response = await invokeLLM({
          model: "llama-3.1-8b-instant",
          messages: history.map(m => ({ role: m.role as any, content: m.content })),
          maxTokens: 2000,
        });

        const aiMsg = response.choices[0]?.message?.content || "Erro";
        await db.addMessage(conversationId, "assistant", aiMsg as string);
        
        return { success: true, messages: await db.getConversationMessages(conversationId) };
      }),
  }),

  chat: router({
    send: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        content: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await db.addMessage(input.conversationId, "user", input.content);
        const history = await db.getConversationMessages(input.conversationId);
        
        const response = await invokeLLM({
          model: "llama-3.1-8b-instant",
          messages: history.map(m => ({ role: m.role as any, content: m.content })),
          maxTokens: 2000,
        });

        const aiMsg = response.choices[0]?.message?.content || "Erro";
        await db.addMessage(input.conversationId, "assistant", aiMsg as string);
        
        return { success: true, messages: await db.getConversationMessages(input.conversationId) };
      }),
  }),
});

export type AppRouter = typeof appRouter;
