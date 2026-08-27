import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { basename, extname } from "node:path";
import { z } from "zod";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { notifyOwner } from "./_core/notification";
import { ENV } from "./_core/env";
import { buildStaticPixBrCode } from "./pixBrCode";
import { getPixPackage, getPixPublicConfig, PIX_PACKAGES } from "./pixConfig";
import * as db from "./db";
import { SYSTEM_PROMPT } from "./systemPrompt";
import { asUntrustedContent, isApprovalKeyValid, redactSensitiveText } from "./security";
import { CHAT_REQUESTS_PER_WINDOW, enforceUserRateLimit, UPLOAD_REQUESTS_PER_WINDOW } from "./rateLimit";
import { buildBlockMessage, getAccountBlockState, getSupportLinks, registerUserAbuseSignal, TEMPORARY_BLOCK_DURATION_MS } from "./abuseProtection";

// Gerenciamento de capacidade simples
let activeConnections = 0;
const MAX_CONCURRENT_CHATS = 10;

function configuredOwnerOpenId(): string {
  return ENV.ownerOpenId.trim();
}

function isConfiguredOwner(user: any): boolean {
  const ownerOpenId = configuredOwnerOpenId();
  return Boolean(ownerOpenId) && user?.openId === ownerOpenId;
}

function requireOwnerConfiguration(): string {
  const ownerOpenId = configuredOwnerOpenId();
  if (!ownerOpenId) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "OWNER_OPEN_ID precisa ser configurado antes de alterar administradores ou excluir contas.",
    });
  }
  return ownerOpenId;
}
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_BASE64_CHARS = 14_000_000;
const ALLOWED_UPLOAD_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/pdf",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mpeg",
  "audio/wav",
  "video/mp4",
]);

export const appRouter = router({
  auth: router({
    me: protectedProcedure.query(({ ctx }) => {
      return ctx.user;
    }),
    blockStatus: publicProcedure.query(({ ctx }) => {
      const state = ctx.user ? getAccountBlockState(ctx.user) : { blocked: false, permanent: false, until: null, reason: null };
      return {
        blocked: state.blocked,
        permanent: state.permanent,
        message: state.blocked ? buildBlockMessage(state) : null,
        blockedUntil: state.until?.toISOString() ?? null,
        support: state.blocked ? getSupportLinks() : null,
      };
    }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const { COOKIE_NAME } = await import("@shared/const");
      const { getSessionCookieOptions } = await import("./_core/cookies");
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: 0 });
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
    listUsers: adminProcedure.query(async () => {
      const users = await db.getAllUsers();
      const results = [];
      for (const u of users) {
        const balance = await db.getUserCredits(u.id);
        results.push({
          id: u.id,
          name: u.name,
          email: u.email,
          loginMethod: u.loginMethod,
          role: u.role,
          isOwner: isConfiguredOwner(u),
          balance,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
          lastSignedIn: u.lastSignedIn,
          accountStatus: (() => {
            const state = getAccountBlockState(u);
            return state.blocked ? (state.permanent ? "blocked" : "temporarily_blocked") : "active";
          })(),
          blockedUntil: getAccountBlockState(u).until,
          blockedReason: u.blockedReason,
        });
      }
      return results;
    }),

    adjustCredits: adminProcedure
      .input(z.object({
        userId: z.number().int().positive(),
        amount: z.number().int().min(-1_000_000).max(1_000_000),
        approvalKey: z.string().min(1).max(512),
        confirmation: z.string().min(1).max(80),
      }))
      .mutation(async ({ input }) => {
        if (input.confirmation !== "CONFIRMAR") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Digite CONFIRMAR para alterar créditos." });
        }
        if (!isApprovalKeyValid(input.approvalKey)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha de aprovação incorreta" });
        }

        const target = await db.getUserById(input.userId);
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada" });
        if (isConfiguredOwner(target)) return { success: true, skipped: true, reason: "O proprietário possui créditos ilimitados." };

        const current = await db.getUserCredits(input.userId);
        if (current + input.amount < 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A alteração não pode deixar créditos negativos." });
        }
        await db.addCredits(input.userId, input.amount);
        return { success: true, skipped: false };
      }),

    adjustCreditsBatch: adminProcedure
      .input(z.object({
        userIds: z.array(z.number().int().positive()).min(1).max(100),
        amount: z.number().int().min(-1_000_000).max(1_000_000),
        approvalKey: z.string().min(1).max(512),
        confirmation: z.string().min(1).max(80),
      }))
      .mutation(async ({ input }) => {
        if (input.confirmation !== "CONFIRMAR") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Digite CONFIRMAR para alterar créditos." });
        }
        if (!isApprovalKeyValid(input.approvalKey)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha de aprovação incorreta" });
        }

        const userIds = Array.from(new Set(input.userIds));
        const targets = await Promise.all(userIds.map(userId => db.getUserById(userId)));
        if (targets.some(target => !target)) throw new TRPCError({ code: "NOT_FOUND", message: "Uma ou mais contas não foram encontradas." });

        for (const target of targets) {
          if (!target || isConfiguredOwner(target)) continue;
          const current = await db.getUserCredits(target.id);
          if (current + input.amount < 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `A alteração deixaria créditos negativos para a conta ${target.id}.` });
          }
        }

        for (const target of targets) {
          if (target && !isConfiguredOwner(target)) await db.addCredits(target.id, input.amount);
        }
        return { success: true, updatedUserIds: userIds };
      }),

    setRoles: adminProcedure
      .input(z.object({
        userIds: z.array(z.number().int().positive()).min(1).max(100),
        role: z.enum(["user", "admin"]),
        approvalKey: z.string().min(1).max(512),
        confirmation: z.string().min(1).max(80),
        ownerOverride: z.boolean().default(false),
        ownerConfirmation: z.string().max(100).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireOwnerConfiguration();
        if (input.confirmation !== "CONFIRMAR") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Digite CONFIRMAR para alterar administradores." });
        }
        if (!isApprovalKeyValid(input.approvalKey)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha de aprovação incorreta" });
        }

        const userIds = Array.from(new Set(input.userIds));
        const targets = await Promise.all(userIds.map(userId => db.getUserById(userId)));
        if (targets.some(target => !target)) throw new TRPCError({ code: "NOT_FOUND", message: "Uma ou mais contas não foram encontradas." });
        const ownerTargets = targets.filter(target => target && isConfiguredOwner(target));
        if (ownerTargets.length > 0) {
          if (!isConfiguredOwner(ctx.user) || !input.ownerOverride || input.ownerConfirmation !== "CONFIRMAR PROPRIETÁRIO") {
            throw new TRPCError({ code: "FORBIDDEN", message: "A conta proprietária exige confirmação especial do próprio proprietário." });
          }
        }

        for (const target of targets) {
          if (target) await db.updateUserRole(target.id, input.role);
        }
        return { success: true, updatedUserIds: userIds, ownerProtected: ownerTargets.length === 0 };
      }),

    deleteUsers: adminProcedure
      .input(z.object({
        userIds: z.array(z.number().int().positive()).min(1).max(100),
        approvalKey: z.string().min(1).max(512),
        confirmation: z.string().min(1).max(80),
        ownerOverride: z.boolean().default(false),
        ownerConfirmation: z.string().max(100).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireOwnerConfiguration();
        if (input.confirmation !== "EXCLUIR CONTAS") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Digite EXCLUIR CONTAS para apagar as contas selecionadas." });
        }
        if (!isApprovalKeyValid(input.approvalKey)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha de aprovação incorreta" });
        }

        const userIds = Array.from(new Set(input.userIds));
        if (userIds.includes(ctx.user.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "A própria sessão não pode excluir a conta que está em uso." });
        }
        const targets = await Promise.all(userIds.map(userId => db.getUserById(userId)));
        if (targets.some(target => !target)) throw new TRPCError({ code: "NOT_FOUND", message: "Uma ou mais contas não foram encontradas." });
        const ownerTargets = targets.filter(target => target && isConfiguredOwner(target));
        if (ownerTargets.length > 0 && (!isConfiguredOwner(ctx.user) || !input.ownerOverride || input.ownerConfirmation !== "CONFIRMAR PROPRIETÁRIO")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "A conta proprietária exige confirmação especial do próprio proprietário." });
        }

        for (const target of targets) {
          if (target) await db.deleteUserAccount(target.id);
        }
        return { success: true, deletedUserIds: userIds };
      }),

    abuseCases: adminProcedure.query(async () => db.getAbuseCases()),

    blockUsers: adminProcedure
      .input(z.object({
        userIds: z.array(z.number().int().positive()).min(1).max(100),
        reason: z.string().trim().min(3).max(500),
        approvalKey: z.string().min(1).max(512),
        confirmation: z.literal("BLOQUEAR CONTAS"),
      }))
      .mutation(async ({ ctx, input }) => {
        requireOwnerConfiguration();
        if (!isApprovalKeyValid(input.approvalKey)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha de aprovação incorreta" });
        }
        const userIds = Array.from(new Set(input.userIds));
        if (userIds.includes(ctx.user.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "A sessão administrativa em uso não pode ser bloqueada." });
        }
        const targets = await Promise.all(userIds.map(userId => db.getUserById(userId)));
        if (targets.some(target => !target)) throw new TRPCError({ code: "NOT_FOUND", message: "Uma ou mais contas não foram encontradas." });
        if (targets.some(target => target && isConfiguredOwner(target))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "A conta proprietária nunca pode ser bloqueada por esta ação." });
        }
        for (const target of targets) {
          if (target) await db.permanentlyBlockUser(target.id, input.reason, ctx.user.id);
        }
        return { success: true, blockedUserIds: userIds };
      }),

    unblockUsers: adminProcedure
      .input(z.object({
        userIds: z.array(z.number().int().positive()).min(1).max(100),
        note: z.string().trim().max(500).optional(),
        approvalKey: z.string().min(1).max(512),
        confirmation: z.literal("DESBLOQUEAR CONTAS"),
      }))
      .mutation(async ({ ctx, input }) => {
        requireOwnerConfiguration();
        if (!isApprovalKeyValid(input.approvalKey)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha de aprovação incorreta" });
        }
        const userIds = Array.from(new Set(input.userIds));
        const targets = await Promise.all(userIds.map(userId => db.getUserById(userId)));
        if (targets.some(target => !target)) throw new TRPCError({ code: "NOT_FOUND", message: "Uma ou mais contas não foram encontradas." });
        if (targets.some(target => target && isConfiguredOwner(target))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "A conta proprietária é protegida e não precisa de desbloqueio." });
        }
        for (const target of targets) {
          if (target) await db.clearUserBlock(target.id, ctx.user.id, input.note);
        }
        return { success: true, unblockedUserIds: userIds };
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
        ...getPixPublicConfig(),
        supportWhatsAppNumber: process.env.SUPPORT_WHATSAPP_NUMBER?.trim() || null,
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
          const conversation = await db.getConversationForUser(input.id, ctx.user.id);
          if (!conversation) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada" });
          }
          return db.getMessages(input.id, ctx.user.id);
        }),
      attachments: protectedProcedure
        .input(z.object({ conversationId: z.number() }))
        .query(async ({ ctx, input }) => {
          const conversation = await db.getConversationForUser(input.conversationId, ctx.user.id);
          if (!conversation) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada" });
          }
          const dbInstance = await db.getDb();
          const { messages } = await import("../drizzle/schema");
          const { eq, and, isNotNull } = await import("drizzle-orm");
          const msgs = await dbInstance
            .select()
            .from(messages)
            .where(and(eq(messages.conversationId, input.conversationId), isNotNull(messages.metadata)));
          return msgs
            .map((m: any) => ({ id: m.id, ...JSON.parse(m.metadata || "{}") }))
            .filter((meta: any) => meta.type === "attachment");
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
        const conversation = await db.getConversationForUser(input.conversationId, ctx.user.id);
        if (!conversation) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada" });
        }

        try {
          enforceUserRateLimit(ctx.user.id, "chat", CHAT_REQUESTS_PER_WINDOW);
        } catch (error) {
          const abuse = registerUserAbuseSignal(ctx.user.id, "chat_rate_limit");
          if (abuse.shouldTemporarilyBlock && !isConfiguredOwner(ctx.user)) {
            const until = new Date(Date.now() + TEMPORARY_BLOCK_DURATION_MS);
            await db.temporarilyBlockUser(ctx.user.id, until, "Muitas requisições de chat em sequência.", abuse.count, abuse.signals).catch(() => undefined);
          }
          throw error;
        }

        if (ctx.user.role !== "admin") {
          const balance = await db.getUserCredits(ctx.user.id);
          if (balance <= 0) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Créditos insuficientes. Por favor, recarregue sua conta."
            });
          }
        }

        if (activeConnections >= MAX_CONCURRENT_CHATS) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Capacidade máxima atingida. Tente novamente em alguns segundos."
          });
        }

        activeConnections++;
        try {
          await db.addMessage(input.conversationId, ctx.user.id, "user", input.content);
          
          const { checkContextSufficiency } = await import("./honestyGuardrail");
          const msgs = await db.getMessages(input.conversationId, ctx.user.id);

          const attachmentIds = input.attachmentIds || [];
          if (attachmentIds.length > 3) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione no máximo três anexos por mensagem." });
          }

          const attachmentMessages = msgs.filter((message: any) => {
            if (!message.metadata) return false;
            try {
              const metadata = JSON.parse(message.metadata);
              return metadata.type === "attachment" && attachmentIds.includes(message.id);
            } catch {
              return false;
            }
          });

          if (attachmentMessages.length !== new Set(attachmentIds).size) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Um ou mais anexos não pertencem a esta conversa." });
          }

          const attachmentTexts: string[] = [];
          if (attachmentMessages.length > 0) {
            const { extractTextContent } = await import("./fileExtraction");
            const { storageGetSignedUrl } = await import("./storage");

            for (const message of attachmentMessages) {
              const metadata = JSON.parse(message.metadata);
              if (typeof metadata.storageUrl !== "string" || !metadata.storageUrl.startsWith("/manus-storage/")) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Referência de anexo inválida." });
              }
              const storageKey = metadata.storageUrl.slice("/manus-storage/".length);
              const signedUrl = await storageGetSignedUrl(storageKey);
              attachmentTexts.push(await extractTextContent(signedUrl, metadata.fileType, metadata.fileName));
            }
          }

          const sufficiencyHistory = attachmentTexts.length > 0
            ? [...msgs, { role: "system", content: attachmentTexts.join("\n\n"), metadata: JSON.stringify({ type: "attachment" }) }]
            : msgs;
          const triageInput = [input.content, ...attachmentTexts].join("\n\n");
          const { getFreelancerProjectTriage, buildFreelancerProjectTriageRequest } = await import("./systemPrompt");
          const triage = getFreelancerProjectTriage(triageInput);
          if (triage) {
            const reply = buildFreelancerProjectTriageRequest(triage);
            await db.addMessage(input.conversationId, ctx.user.id, "assistant", redactSensitiveText(reply));
            return { success: true, warning: "project_triage_blocked" };
          }

          const sufficiency = checkContextSufficiency(input.content, sufficiencyHistory);
          
          if (!sufficiency.isSufficient) {
            const reply = sufficiency.missingInfo || "Preciso de mais informações para realizar essa tarefa corretamente.";
            await db.addMessage(input.conversationId, ctx.user.id, "assistant", redactSensitiveText(reply));
            return { success: true, warning: "insufficient_info" };
          }

          const { invokeLLMStream, readLLMStreamContent } = await import("./_core/llm");
          
          const llmMessages: any[] = [
            { role: "system", content: SYSTEM_PROMPT },
            ...msgs.map((m: any) => {
              if (m.role === "assistant") {
                return { role: "assistant", content: m.content };
              }

              const source = m.role === "system" || m.metadata ? "anexo" : "mensagem";
              return { role: "user", content: asUntrustedContent(m.content, source) };
            }),
            ...(attachmentTexts.length > 0
              ? [{ role: "user", content: asUntrustedContent(attachmentTexts.join("\n\n"), "anexo") }]
              : [])
          ];

          const stream = await invokeLLMStream({
            model: "gemini-3-flash-preview",
            messages: llmMessages,
          });

          const assistantResponse = await readLLMStreamContent(stream);
          const safeAssistantResponse = redactSensitiveText(assistantResponse);
          await db.addMessage(input.conversationId, ctx.user.id, "assistant", safeAssistantResponse);
          if (ctx.user.role !== "admin") {
            await db.addCredits(ctx.user.id, -1);
          }
          
          return { success: true };
        } finally {
          activeConnections--;
        }
      }),
  }),

  upload: router({
    file: protectedProcedure
      .input(z.object({
        conversationId: z.number().int().positive(),
        fileName: z.string().trim().min(1).max(200),
        fileType: z.string().trim().min(1).max(120),
        base64: z.string().min(1).max(MAX_UPLOAD_BASE64_CHARS),
      }))
      .mutation(async ({ ctx, input }) => {
        const conversation = await db.getConversationForUser(input.conversationId, ctx.user.id);
        if (!conversation) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada" });
        }

        try {
          enforceUserRateLimit(ctx.user.id, "upload", UPLOAD_REQUESTS_PER_WINDOW);
        } catch (error) {
          const abuse = registerUserAbuseSignal(ctx.user.id, "upload_rate_limit");
          if (abuse.shouldTemporarilyBlock && !isConfiguredOwner(ctx.user)) {
            const until = new Date(Date.now() + TEMPORARY_BLOCK_DURATION_MS);
            await db.temporarilyBlockUser(ctx.user.id, until, "Muitos uploads em sequência.", abuse.count, abuse.signals).catch(() => undefined);
          }
          throw error;
        }

        const safeFileName = basename(input.fileName);
        if (safeFileName !== input.fileName || safeFileName.includes("..")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nome de arquivo inválido" });
        }

        const normalizedType = input.fileType.toLowerCase().split(";", 1)[0].trim();
        if (!ALLOWED_UPLOAD_TYPES.has(normalizedType)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Tipo de arquivo não permitido" });
        }

        const encoded = input.base64.replace(/^data:[^;]+;base64,/, "");
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Conteúdo Base64 inválido" });
        }

        const buf = Buffer.from(encoded, "base64");
        if (buf.length === 0 || buf.length > MAX_UPLOAD_BYTES) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo vazio ou maior que 10 MB" });
        }

        const extension = extname(safeFileName).toLowerCase();
        const storageKey = `uploads/${ctx.user.id}/${input.conversationId}/${randomUUID()}${extension}`;
        const { storagePut } = await import("./storage");
        const { url } = await storagePut(storageKey, buf, normalizedType);
        const meta = { type: "attachment", fileName: safeFileName, fileType: normalizedType, storageUrl: url };
        await db.addMessage(input.conversationId, ctx.user.id, "system", `Arquivo anexado: ${safeFileName}`, meta);
        return { success: true, url };
      }),
  }),

  improvements: router({
    list: adminProcedure.query(async () => {
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
    approve: adminProcedure
      .input(z.object({ id: z.number(), approvalKey: z.string().min(1).max(512) }))
      .mutation(async ({ input }) => {
        if (!isApprovalKeyValid(input.approvalKey)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha de aprovação incorreta" });
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
