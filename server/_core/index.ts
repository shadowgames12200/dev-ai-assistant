import path from "path";
import "dotenv/config";
import dns from "node:dns";
// Forçar o Node.js a priorizar IPv4 sobre IPv6 para evitar erros de rede no Render (ENETUNREACH)
dns.setDefaultResultOrder("ipv4first");

import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth.js";
import { registerStorageProxy } from "./storageProxy.js";
import { registerLocalAuthRoutes } from "../routes/localAuth.js";
import { appRouter } from "../routers.js";
import { createContext } from "./context.js";
import { serveStatic, setupVite } from "./vite.js";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "200mb" }));
  app.use(express.urlencoded({ limit: "200mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerLocalAuthRoutes(app);

  // SSE Streaming Endpoint
  app.get("/api/chat/stream", async (req, res) => {
    const conversationId = parseInt(req.query.conversationId as string);
    const content = req.query.content as string;

    if (isNaN(conversationId) || !content) {
      return res.status(400).json({ error: "Missing conversationId or content" });
    }

    // Configurar headers SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    try {
      // Import dinâmico para evitar dependência circular se necessário
      const { invokeGroq } = await import("./groq.js");
      
      const stream = await invokeGroq({
        messages: [{ role: "user", content }],
        stream: true
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

      // Salvar a mensagem final no banco de dados
      const { addMessage } = await import("../db.js");
      await addMessage(conversationId, "assistant", fullContent);
      
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
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    // Em produção, servimos os arquivos estáticos da pasta dist
    const distPath = path.resolve(process.cwd(), "dist/public");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api")) return;
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const port = parseInt(process.env.PORT || "3000");

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
  });
}

startServer().catch(console.error);
