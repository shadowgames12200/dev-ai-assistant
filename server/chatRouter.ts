import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Readable } from "node:stream";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { storagePut } from "./storage";
import type { ImageContent, Message, TextContent } from "./_core/llm";
import { ENV } from "./_core/env";

// Download a file (storage URL or public URL) as a Buffer.
async function downloadBuffer(url: string): Promise<Buffer> {
  const resp = await fetch(url, { redirect: "follow" });
  if (!resp.ok) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Não foi possível ler o arquivo anexado (${url})`,
    });
  }
  return Buffer.from(await resp.arrayBuffer());
}

const SYSTEM_PROMPT = `Você é o DevAI Assistant, um assistente inteligente especializado em programação e produtividade.
Suas diretrizes:
- Ajude com desenvolvimento de software: código, debug, arquitetura, boas práticas, revisão de código.
- Ajude com produtividade: organização de tarefas, dicas de ferramentas, automação, hábitos de trabalho.
- Responda em português brasileiro, de forma clara e objetiva.
- Quando fornecer código, use blocos de código markdown com a linguagem correta.
- Seja didático: explique o "porquê" das suas recomendações quando relevante.
- Se receber conteúdo de arquivos anexados (código, documentos, imagens descritos em texto), leve em consideração esse contexto na resposta.
- Se a pergunta não tiver relação com programação ou produtividade, responda de forma breve e amigável, redirecionando para o escopo do assistente.`;

export const chatRouter = router({
  // ─── Conversations ───

  conversations: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      return db.getUserConversations(ctx.user.id);
    }),
    create: protectedProcedure
      .input(z.object({ title: z.string().max(256).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const id = await db.createConversation(ctx.user.id, input.title ?? "Nova conversa");
        return { id, title: input.title ?? "Nova conversa" };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await db.deleteConversation(input.id, ctx.user.id);
        return { success: true };
      }),
    rename: protectedProcedure
      .input(z.object({ id: z.number(), title: z.string().max(256) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const conv = await db.getConversation(input.id, ctx.user.id);
        if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada" });
        await db.updateConversationTitle(input.id, input.title);
        return { success: true };
      }),
    messages: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const conv = await db.getConversation(input.id, ctx.user.id);
        if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada" });
        return db.getConversationMessages(input.id);
      }),
    attachments: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const conv = await db.getConversation(input.conversationId, ctx.user.id);
        if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada" });
        return db.getConversationAttachments(input.conversationId);
      }),
  }),

  // ─── Chat with streaming ───

  chat: router({
    send: protectedProcedure
      .input(
        z.object({
          conversationId: z.number(),
          content: z.string().min(1).max(50000),
          attachmentIds: z.array(z.number()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

        const conv = await db.getConversation(input.conversationId, ctx.user.id);
        if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada" });

        // Store user message
        await db.addMessage(input.conversationId, "user", input.content);

        // Collect attachment context (images as inline base64 for the LLM,
        // text-like files have their content extracted into the prompt)
        const attachmentTextContext: string[] = [];
        const attachmentImages: { fileName: string; base64: string; mime: string }[] = [];
        const attIds = input.attachmentIds ?? [];
        if (attIds.length > 0) {
          const allAttachments = await db.getConversationAttachments(input.conversationId);
          const selected = allAttachments.filter((a) => attIds.includes(a.id));
          const { extractTextContent } = await import("./fileExtraction");
          // Resolve storage-relative URLs against this server's base so the
          // storage proxy (/manus-storage/*) serves them (works in dev and in
          // the deployed Node backend on Vercel).
          const base = `${(ctx.req as any).protocol ?? "https"}://${(ctx.req as any).headers?.host ?? "localhost"}`;
          for (const att of selected) {
            const absUrl = att.storageUrl.startsWith("http")
              ? att.storageUrl
              : `${base}${att.storageUrl.startsWith("/") ? "" : "/"}${att.storageUrl}`;
            if (att.fileType.startsWith("image/")) {
              const buf = await downloadBuffer(absUrl);
              attachmentImages.push({
                fileName: att.fileName,
                base64: buf.toString("base64"),
                mime: att.fileType,
              });
            } else {
              const extracted = await extractTextContent(absUrl, att.fileType, att.fileName);
              attachmentTextContext.push(extracted);
            }
          }
        }

        // Build conversation history (last 40 messages)
        const history = await db.getConversationMessages(input.conversationId);
        const recent = history.slice(-40);
        const llmMessages: Message[] = [
          { role: "system", content: SYSTEM_PROMPT },
          ...recent
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        ];
        // Append attachment context to the user message
        const lastIdx = llmMessages.length - 1;
        const extraParts: string[] = [];
        if (attachmentTextContext.length > 0) {
          extraParts.push(...attachmentTextContext);
        }
        const baseContent = llmMessages[lastIdx].content as string;
        const imageParts: (TextContent | ImageContent)[] = [];
        for (const img of attachmentImages) {
          imageParts.push({
            type: "text",
            text: `[Imagem anexada: ${img.fileName}]`,
          });
          imageParts.push({
            type: "image_url",
            image_url: { url: `data:${img.mime};base64,${img.base64}` },
          });
        }
        llmMessages[lastIdx] = {
          ...llmMessages[lastIdx],
          content: [
            { type: "text" as const, text: baseContent },
            ...extraParts.map((t) => ({ type: "text" as const, text: t })),
            ...imageParts,
          ],
        };

        // Streaming response via SSE
        const res = ctx.res as any;
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });

        const encoder = new TextEncoder();
        let finished = false;
        res.on("close", () => {
          finished = true;
        });

        try {
          const { invokeLLMStream } = await import("./_core/llm");
          const llmResponse = await invokeLLMStream({
            model: "gemini-2.5-flash",
            messages: llmMessages as any,
          });

          let fullContent = "";
          const reader = (llmResponse.body as ReadableStream<Uint8Array>).getReader();
          const decoder = new TextDecoder();

          // Pipe upstream SSE to the client SSE, extracting content deltas.
          // Listen to `res` close (not req) so the upstream is not aborted after the first event.
          while (true) {
            const { done, value } = await reader.read();
            if (done || finished) break;
            const text = decoder.decode(value, { stream: true });
            const lines = text.split("\n").filter((l: string) => l.startsWith("data: "));
            for (const line of lines) {
              const payload = line.slice(6);
              if (payload === "[DONE]") break;
              try {
                const json = JSON.parse(payload);
                const delta =
                  json.choices?.[0]?.delta?.content ??
                  json.choices?.[0]?.message?.content ??
                  "";
                if (delta) {
                  fullContent += delta;
                  res.write(encoder.encode(`data: ${JSON.stringify({ content: delta })}\n\n`));
                }
              } catch {
                // Ignore malformed chunks
              }
            }
          }

          res.write(encoder.encode("data: [DONE]\n\n"));
          res.end();

          // Persist assistant message
          try {
            await db.addMessage(input.conversationId, "assistant", fullContent);
          } catch (e) {
            console.error("[Chat] Failed to persist assistant message:", e);
          }
        } catch (error) {
          console.error("[Chat] LLM error:", error);
          if (!finished) {
            res.write(
              encoder.encode(
                `data: ${JSON.stringify({ error: "Erro ao gerar resposta. Tente novamente." })}\n\n`
              )
            );
            res.write(encoder.encode("data: [DONE]\n\n"));
            res.end();
          }
        }

        // Mark as finished for tRPC mutation return (caller uses SSE, not the return)
        return { conversationId: input.conversationId, streaming: true };
      }),
  }),

  // ─── Upload ───

  upload: router({
    uploadFile: protectedProcedure
      .input(
        z.object({
          conversationId: z.number(),
          fileName: z.string().min(1).max(512),
          fileContent: z.string(), // base64
          fileType: z.string().max(128),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

        const conv = await db.getConversation(input.conversationId, ctx.user.id);
        if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada" });

        const buffer = Buffer.from(input.fileContent, "base64");
        // ~4MB limit on Vercel serverless
        if (buffer.length > 4 * 1024 * 1024) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Arquivo muito grande. O limite é 4MB.",
          });
        }

        const ext = input.fileName.split(".").pop() ?? "";
        const key = `${ctx.user.id}-files/${Date.now()}-${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { url } = await storagePut(key, buffer, input.fileType || "application/octet-stream");

        const attId = await db.addAttachment({
          conversationId: input.conversationId,
          userId: ctx.user.id,
          fileName: input.fileName,
          fileType: input.fileType,
          fileSize: buffer.length,
          storageUrl: url,
        });

        return { id: attId, url, fileName: input.fileName };
      }),
  }),
});
