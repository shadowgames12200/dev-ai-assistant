import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers.js";
import { createContext } from "./context.js";
import { registerStorageProxy } from "./storageProxy.js";
import { registerOAuthRoutes } from "./oauth.js";
import { registerLocalAuthRoutes } from "../routes/localAuth.js";
import { serveStatic, setupVite } from "./vite.js";
import { ENV } from "./env.js";
import * as db from "../db.js";
import type { Server } from "http";

async function startServer() {
  const app = express();
  
  // Aumentar limite de payload para arquivos grandes
  app.use(express.json({ limit: "200mb" }));
  app.use(express.urlencoded({ limit: "200mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerLocalAuthRoutes(app);

  // SSE Streaming Endpoint - Otimizado para J.A.R.V.I.S.
  app.get("/api/chat/stream", async (req, res) => {
    const conversationId = parseInt(req.query.conversationId as string);
    const content = req.query.content as string;
    const userId = 1; // Simplificado para este ambiente, idealmente pegaria da sessão

    if (isNaN(conversationId) || !content) {
      return res.status(400).json({ error: "Missing conversationId or content" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    try {
      const { invokeGroq } = await import("./groq.js");
      const { buildSmartContext } = await import("./memory.js");
      const { buildMemoryContext } = await import("./semantic-memory.js");
      
      // Buscar histórico para contexto
      const history = await db.getConversationMessages(conversationId);
      const truncatedHistory = history.slice(-10).map(m => ({ role: m.role as any, content: m.content }));

      // Construir contexto inteligente (Personalidade J.A.R.V.I.S.)
      const { messages } = await buildSmartContext(userId, conversationId, content, truncatedHistory);
      
      // Adicionar memória semântica
      const semanticContext = await buildMemoryContext(userId, content);
      if (semanticContext) {
        messages.splice(1, 0, { role: "system", content: semanticContext });
      }

      const stream = await invokeGroq({
        messages: messages.map(m => ({ role: m.role, content: typeof m.content === "string" ? m.content : "" })),
        stream: true,
        temperature: 0.5,
        model: "llama-3.3-70b-versatile"
      }) as ReadableStream;

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;
            
            try {
              const parsed = JSON.parse(data);
              const token = parsed.choices[0]?.delta?.content || "";
              if (token) {
                fullContent += token;
                res.write(`data: ${JSON.stringify({ token })}\n\n`);
              }
            } catch (e) {}
          }
        }
      }

      // Salvar no banco
      await db.addMessage(conversationId, "assistant", fullContent);
      res.write(`data: [DONE]\n\n`);
    } catch (error) {
      console.error("[SSE] Error:", error);
      res.write(`data: ${JSON.stringify({ error: (error as Error).message })}\n\n`);
    } finally {
      res.end();
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const server: Server = app.listen(0, "0.0.0.0", () => {});
    server.close();
    await setupVite(app, server);
  }

  const port = parseInt(process.env.PORT || "3000", 10);
  app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer().catch(console.error);
