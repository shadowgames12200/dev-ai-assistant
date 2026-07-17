import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";

const SYSTEM_PROMPT = `Você é o DevAI, um assistente de IA extremamente avançado e versátil. Suas capacidades incluem:

1. **Programação especializada**: Você é especialista em TODAS as linguagens de programação (Python, JavaScript, TypeScript, Java, C, C++, C#, Go, Rust, Ruby, PHP, Swift, Kotlin, HTML/CSS, SQL, R, e muitas outras). Você pode criar programas completos, desde scripts simples até aplicações complexas.

2. **Desenvolvimento de projetos**: Você pode ajudar a arquitetar, planejar e construir programas completos, incluindo: aplicações web, APIs, scripts de automação, ferramentas de linha de comando, bots, e muito mais.

3. **Assistente do dia a dia**: Você também ajuda com questões cotidianas - organização, produtividade, aprendizado, dicas, explicações, traduções, resumos, e qualquer outra tarefa que alguém precise de ajuda.

4. **Conhecimento técnico profundo**: Você explica conceitos complexos de forma clara, faz debugging, revisa código, sugere melhorias de performance, segurança e boas práticas.

Diretrizes:
- Sempre responda em português brasileiro, a menos que o usuário peça outro idioma.
- Para código, forneça exemplos completos e funcionais quando possível.
- Use markdown para formatação, incluindo blocos de código com a linguagem especificada.
- Seja detalhado e preciso, mas conciso quando apropriado.
- Se não souber algo, diga honestamente.`;

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // ─── Conversations ───
  conversations: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      return db.getUserConversations(ctx.user.id);
    }),

    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(256).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const title = input.title ?? "Nova conversa";
        const id = await db.createConversation(ctx.user.id, title);
        return { id, title };
      }),

    delete: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await db.deleteConversation(input.id, ctx.user.id);
        return { success: true };
      }),

    rename: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(256),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        // Verify ownership
        const conv = await db.getConversation(input.id, ctx.user.id);
        if (!conv) throw new TRPCError({ code: "NOT_FOUND" });
        await db.updateConversationTitle(input.id, input.title);
        return { success: true };
      }),
  }),

  // ─── Messages ───
  messages: router({
    list: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const conv = await db.getConversation(input.conversationId, ctx.user.id);
        if (!conv) throw new TRPCError({ code: "NOT_FOUND" });
        return db.getConversationMessages(input.conversationId);
      }),
  }),

  // ─── Chat (send message and get AI response) ───
  chat: router({
    send: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        content: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

        // Verify conversation ownership
        const conv = await db.getConversation(input.conversationId, ctx.user.id);
        if (!conv) throw new TRPCError({ code: "NOT_FOUND" });

        // Save user message
        await db.addMessage(input.conversationId, "user", input.content);

        // Get conversation history
        const allMessages = await db.getConversationMessages(input.conversationId);

        // Build messages array for LLM
        const llmMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
          { role: "system", content: SYSTEM_PROMPT },
          ...allMessages.map(m => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ];

        // Call LLM
        try {
          const response = await invokeLLM({
            model: "gpt-5-mini",
            messages: llmMessages,
            maxTokens: 4000,
          });

          const rawContent = response.choices[0]?.message?.content;
          const aiContent = typeof rawContent === "string" ? rawContent : "Desculpe, não consegui gerar uma resposta.";

          // Save AI response
          await db.addMessage(input.conversationId, "assistant", aiContent);

          // Update conversation title if it's the first message pair
          if (allMessages.length <= 2) {
            const title = input.content.slice(0, 50) + (input.content.length > 50 ? "..." : "");
            await db.updateConversationTitle(input.conversationId, title);
          }

          // Update conversation timestamp
          await db.updateConversationTitle(input.conversationId, conv.title);

          // Get updated messages
          const updatedMessages = await db.getConversationMessages(input.conversationId);

          return {
            success: true,
            messages: updatedMessages,
          };
        } catch (error) {
          console.error("[Chat] LLM error:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Erro ao processar sua mensagem. Tente novamente.",
          });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
