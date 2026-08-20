import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { chatRouter } from "./chatRouter";
import * as db from "./db";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
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

  chat: chatRouter,

  // Admin-only router
  admin: router({
    listUsers: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user || ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      let rows: any[] = [];
      try {
        const sdb = await db.getDb();
        if (!sdb) throw new Error("no db");
        const [r] = await (sdb as any).session.client.query(
          "SELECT id, openId, name, email, loginMethod, role, createdAt, lastSignedIn FROM users ORDER BY createdAt DESC"
        );
        rows = r || [];
      } catch {
        rows = await db.getAllUsers();
      }
      // Normalize JSON profiles to the shape expected by the admin table
      return rows.map((u: any) => ({
        id: Number(u.id || 0),
        openId: u.openId ?? "",
        name: u.name ?? "",
        email: u.email ?? "",
        loginMethod: u.loginMethod ?? "email",
        role: u.role ?? "user",
        createdAt: u.createdAt ?? Date.now(),
        lastSignedIn: u.lastSignedIn ?? 0,
      }));
    }),
    setUserRole: protectedProcedure
      .input(z.object({ id: z.number(), role: z.enum(["admin", "user"]) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user || ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.updateUserRole(input.id, input.role);
        return { success: true };
      }),
  }),
  // Credits
  credits: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const { getBalance, grantTrial } = await import("./_core/credits");
      if (ctx.user.role === "admin") return { balance: -1, unlimited: true };
      await grantTrial(ctx.user.id);
      const balance = await getBalance(ctx.user.id);
      return { balance, unlimited: false };
    }),
    add: protectedProcedure
      .input(z.object({ email: z.string().email(), amount: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Somente admin." });
        const { addCredits } = await import("./_core/credits");
        const ok = await addCredits(input.email, input.amount);
        return { success: ok };
      }),
    remove: protectedProcedure
      .input(z.object({ email: z.string().email(), amount: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Somente admin." });
        const { addCredits } = await import("./_core/credits");
        const ok = await addCredits(input.email, -input.amount);
        return { success: ok };
      }),
    setCost: protectedProcedure
      .input(z.object({ costPerMessage: z.number().int().min(0).max(100) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Somente admin." });
        const { setCostPerMessage } = await import("./_core/credits");
        await setCostPerMessage(input.costPerMessage);
        return { success: true };
      }),
    getCost: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Somente admin." });
      const { getCostPerMessage } = await import("./_core/credits");
      return { costPerMessage: await getCostPerMessage() };
    }),
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Somente admin." });
      const { listUsers } = await import("./_core/credits");
      return listUsers();
    }),
  }),
  // Self-improvement (aprovações)
  selfImprove: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const mod = await import("./_core/self-improvement");
      return { proposals: mod.listProposals() };
    }),
    opportunities: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return { opportunities: db.listLearningOpportunities("pending") };
    }),
    createFromOpportunities: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const mod = await import("./_core/self-improvement");
      const proposal = await mod.createProposalFromLearningQueue();
      if (!proposal) return { success: false, message: "Não há oportunidades seguras pendentes para transformar em proposta.", proposal: null };
      return { success: true, message: "Proposta criada. Ela ainda não pesquisou, não aprendeu permanentemente e não alterou nada.", proposal };
    }),
    approve: protectedProcedure
      .input(z.object({ proposalId: z.string(), approvalKey: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const mod = await import("./_core/self-improvement");
        const approvalKey = (process.env as any).APPROVAL_KEY || "";
        if (input.approvalKey.trim() !== approvalKey) {
          return { success: false, message: "Chave de aprovação inválida. Só o dono pode aprovar melhorias." };
        }
        const proposal = mod.approveProposal(input.proposalId);
        return { success: true, message: "Proposta aprovada pelo dono. Execute os arquivos via o comando de melhoria.", proposal };
      }),
    reject: protectedProcedure
      .input(z.object({ proposalId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const mod = await import("./_core/self-improvement");
        const result = mod.rejectProposal(input.proposalId);
        return { success: true, proposal: result };
      }),
  }),
});

export type AppRouter = typeof appRouter;
