import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { notifyOwner } from "./_core/notification";
import { buildStaticPixBrCode } from "./pix";
import * as db from "./db";
import { SYSTEM_PROMPT } from "./systemPrompt";

// Gerenciamento de capacidade simples
let activeConnections = 0;
const MAX_CONCURRENT_CHATS = 10;

const PIX_PACKAGES = [
  { id: "basico", label: "Básico", amountCents: 1000, credits: 50 },
  { id: "intermediario", label: "Intermediário", amountCents: 2000, credits: 200 },
  { id: "avancado", label: "Avançado", amountCents: 5000, credits: 500 },
];

function getPixPackage(id: string) {
  return PIX_PACKAGES.find(p => p.id === id);
}

export const appRouter = router({
  auth: router({
    me: protectedProcedure.query(({ ctx }) => {
      return ctx.user;
    }),
    logout: protectedProcedure.mutation(async ({ ctx }) => {
      return { success: true };
    }),
  }),

  credits: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const balance = await db.getUserCredits(ctx.user.id);
      return { balance };
    }),
  }),

  admin: router({
    listUsers: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const users = await db.getAllUsers();
      const results = [];
      for (const u of users) {
        const balance = await db.getUserCredits(u.id);
        results.push({ ...u, balance });
      }
      return results;
    }),
    adjustCredits: protectedProcedure
      .input(z.object({ userId: z.number(), amount: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await db.addCredits(input.userId, input.amount);
        return { success: true };
      }),
  }),

  pix: router({
    packages: publicProcedure.query(async () => {
      return {
        packages: PIX_PACKAGES.map(pkg => ({
          ...pkg,
          amount: (pkg.amountCents / 100).toFixed(2),
          brCode: buildStaticPixBrCode(pkg),
        })),
        receiverName: process.env.PIX_RECEIVER_NAME || "Charles Henrique",
        city: process.env.PIX_CITY || "Pirapora",
        supportWhatsAppNumber: process.env.SUPPORT_WHATSAPP_NUMBER || "38991109806",
      };
    }),
    myRequests: protectedProcedure.query(async ({ ctx }) => {
      const dbInstance = await db.getDb();
      const { recharges } = await import("../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");
      const requests = await dbInstance
        .select()
        .from(recharges)
        .where(eq(recharges.userId, ctx.user.id))
        .orderBy(desc(recharges.createdAt));
      return { requests };
    }),
    requestRecharge: protectedProcedure
      .input(z.object({ packageId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const pkg = getPixPackage(input.packageId);
        if (!pkg) throw new TRPCError({ code: "BAD_REQUEST", message: "Pacote inválido" });
        
        const request = await db.createRechargeRequest(
          ctx.user.id,
          pkg.amountCents / 100,
          pkg.credits,
          buildStaticPixBrCode(pkg)
        );

        const notified = await notifyOwner({
          title: "Nova recarga Pix",
          content: `Usuário ${ctx.user.email} solicitou ${pkg.credits} créditos (R$ ${(pkg.amountCents / 100).toFixed(2)}).\nID: ${request.id}`,
        }).catch(() => false);

        return { success: true, request, ownerNotified: !!notified };
      }),
    listPending: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const requests = await db.getPendingRecharges();
      return { requests };
    }),
    approveRecharge: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await db.approveRecharge(input.id);
        return { success: true };
      }),
  }),

  chat: router({
    checkCapacity: publicProcedure.query(async () => {
      const isAvailable = activeConnections < MAX_CONCURRENT_CHATS;
      return { 
        available: isAvailable, 
        message: isAvailable ? "Sistema operando normalmente" : "Capacidade máxima atingida. Por favor, aguarde um momento.",
        currentLoad: activeConnections,
        maxCapacity: MAX_CONCURRENT_CHATS
      };
    }),
    conversations: router({
      list: protectedProcedure.query(async ({ ctx }) => {
        return db.getConversations(ctx.user.id);
      }),
      create: protectedProcedure
        .input(z.object({ title: z.string().optional() }))
        .mutation(async ({ ctx, input }) => {
          return db.createConversation(ctx.user.id, input.title || "Nova conversa");
        }),
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
          await db.deleteConversation(input.id, ctx.user.id);
          return { success: true };
        }),
      rename: protectedProcedure
        .input(z.object({ id: z.number(), title: z.string() }))
        .mutation(async ({ ctx, input }) => {
          const dbInstance = await db.getDb();
          const { conversations } = await import("../drizzle/schema");
          const { eq, and } = await import("drizzle-orm");
          await dbInstance
            .update(conversations)
            .set({ title: input.title, updatedAt: new Date() })
            .where(and(eq(conversations.id, input.id), eq(conversations.userId, ctx.user.id)));
          return { success: true };
        }),
      clear: protectedProcedure.mutation(async ({ ctx }) => {
        await db.clearAllConversations(ctx.user.id);
        return { success: true };
      }),
      messages: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ ctx, input }) => {
          return db.getMessages(input.id);
        }),
      attachments: protectedProcedure
        .input(z.object({ conversationId: z.number() }))
        .query(async ({ ctx, input }) => {
          const dbInstance = await db.getDb();
          const { messages } = await import("../drizzle/schema");
          const { eq, and, isNotNull } = await import("drizzle-orm");
          const msgs = await dbInstance
            .select()
            .from(messages)
            .where(and(eq(messages.conversationId, input.conversationId), isNotNull(messages.metadata)));
          return msgs.map((m: any) => JSON.parse(m.metadata || "{}")).filter((meta: any) => meta.type === "attachment");
        }),
    }),
    send: protectedProcedure
      .input(
        z.object({
          conversationId: z.number(),
          content: z.string(),
          attachmentIds: z.array(z.number()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const balance = await db.getUserCredits(ctx.user.id);
        if (balance <= 0) {
          throw new TRPCError({ 
            code: "FORBIDDEN", 
            message: "Créditos insuficientes. Por favor, recarregue sua conta." 
          });
        }

        if (activeConnections >= MAX_CONCURRENT_CHATS) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Capacidade máxima atingida. Tente novamente em alguns segundos."
          });
        }

        activeConnections++;
        try {
          await db.addMessage(input.conversationId, "user", input.content);
          
          const { checkContextSufficiency } = await import("./honestyGuardrail");
          const history = await db.getMessages(input.conversationId);
          const sufficiency = checkContextSufficiency(input.content, history);
          
          if (!sufficiency.isSufficient) {
            const reply = sufficiency.missingInfo || "Preciso de mais informações para realizar esta tarefa corretamente.";
            await db.addMessage(input.conversationId, "assistant", reply);
            return { success: true, warning: "insufficient_info" };
          }

          const { invokeLLMStream } = await import("./_core/llm");
          
          const llmMessages: any[] = [
            { role: "system", content: SYSTEM_PROMPT },
            ...history.map((m: any) => ({ role: m.role, content: m.content }))
          ];

          const stream = await invokeLLMStream({
            model: "gemini-3.6-flash",
            messages: llmMessages,
          });

          const reader = (stream.body as ReadableStream).getReader();
          let full = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            full += new TextDecoder().decode(value);
          }
          await db.addMessage(input.conversationId, "assistant", full);
          await db.addCredits(ctx.user.id, -1);
          
          return { success: true };
        } finally {
          activeConnections--;
        }
      }),
  }),

  upload: router({
    file: protectedProcedure
      .input(z.object({ conversationId: z.number(), fileName: z.string(), fileType: z.string(), base64: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { storagePut } = await import("./storage");
        const buf = Buffer.from(input.base64, "base64");
        const { url } = await storagePut(`uploads/${input.fileName}`, buf, input.fileType);
        const meta = { type: "attachment", fileName: input.fileName, fileType: input.fileType, storageUrl: url };
        await db.addMessage(input.conversationId, "system", `Arquivo anexado: ${input.fileName}`, meta);
        return { success: true, url };
      }),
  }),

  improvements: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const dbInstance = await db.getDb();
      const { selfImprovements } = await import("../drizzle/schema");
      const { desc } = await import("drizzle-orm");
      return dbInstance.select().from(selfImprovements).orderBy(desc(selfImprovements.createdAt));
    }),
    propose: protectedProcedure
      .input(z.object({ 
        title: z.string(), 
        description: z.string(),
        filesToChange: z.string().optional(),
        risks: z.string().optional(),
        benefits: z.string().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const dbInstance = await db.getDb();
        const { selfImprovements } = await import("../drizzle/schema");
        const [result] = await dbInstance.insert(selfImprovements).values({
          title: input.title,
          description: input.description,
          filesToChange: input.filesToChange,
          risks: input.risks,
          benefits: input.benefits,
          status: "pending"
        }).returning();
        return result;
      }),
    approve: protectedProcedure
      .input(z.object({ id: z.number(), approvalKey: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        if (input.approvalKey !== (process.env.APPROVAL_KEY || "charlespaz")) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Chave de aprovação incorreta" });
        }
        
        const dbInstance = await db.getDb();
        const { selfImprovements } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        
        const [improvement] = await dbInstance
          .update(selfImprovements)
          .set({ status: "approved", updatedAt: new Date() })
          .where(eq(selfImprovements.id, input.id))
          .returning();
          
        if (improvement) {
          const { triggerAgentSandbox } = await import("./githubActions");
          await triggerAgentSandbox({
            improvementId: improvement.id,
            title: improvement.title,
            description: improvement.description
          });

          await notifyOwner({
            title: "Melhoria Aprovada & Sandbox Disparado",
            content: `A melhoria "${improvement.title}" (ID: ${improvement.id}) foi aprovada e o Agente Sandbox foi iniciado no GitHub Actions.`,
          });
        }
        
        return { success: true };
      }),
  }),

  learning: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const dbInstance = await db.getDb();
      const { learningOpportunities } = await import("../drizzle/schema");
      const { desc } = await import("drizzle-orm");
      return dbInstance.select().from(learningOpportunities).orderBy(desc(learningOpportunities.createdAt));
    }),
    dismiss: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const dbInstance = await db.getDb();
        const { learningOpportunities } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await dbInstance
          .update(learningOpportunities)
          .set({ status: "dismissed" })
          .where(eq(learningOpportunities.id, input.id));
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
