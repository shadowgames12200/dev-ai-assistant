import { Router } from "express";
import { invokeGroq } from "../_core/groq.js";
import * as db from "../db.js";
import { buildSmartContext } from "../_core/memory.js";
import { buildMemoryContext } from "../_core/semantic-memory.js";
import { enhancedChat } from "../_core/agent-loop.js";

const router = Router();

router.get("/api/chat/stream-full", async (req, res) => {
  try {
    const { conversationId, content, userId } = req.query;

    if (!conversationId || !content || !userId) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const convId = parseInt(conversationId as string, 10);
    const uId = parseInt(userId as string, 10);
    const userMessage = content as string;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // 1. Salvar mensagem do usuário
    await db.addMessage(convId, "user", userMessage);

    // 2. Buscar histórico
    const history = await db.getConversationMessages(convId);
    
    // 3. Construir contexto inteligente
    const { messages } = await buildSmartContext(
      uId,
      convId,
      userMessage,
      history.map(m => ({ role: m.role, content: m.content }))
    );

    // 4. Adicionar memória semântica
    const semanticContext = await buildMemoryContext(uId, userMessage);
    if (semanticContext) {
      messages.splice(1, 0, { role: "system", content: semanticContext });
    }

    // 5. Streaming com Groq (ou fallback)
    // Nota: O enhancedChat atual não suporta streaming nativo para o cliente SSE facilmente
    // Então vamos usar o invokeGroq diretamente para o streaming de texto
    // Se precisar de ferramentas, o ideal seria o enhancedChat suportar streaming
    
    const stream = await invokeGroq({
      messages: messages as any,
      stream: true,
      temperature: 0.7,
    });

    if (!(stream instanceof ReadableStream)) {
      throw new Error("Failed to start stream");
    }

    const reader = stream.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullResponse = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter(line => line.trim() !== "");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            res.write(`data: [DONE]\n\n`);
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices[0]?.delta?.content || "";
            if (token) {
              fullResponse += token;
              res.write(`data: ${JSON.stringify({ token })}\n\n`);
            }
          } catch (e) {}
        }
      }
    }

    // 6. Salvar resposta do assistente no final
    if (fullResponse) {
      await db.addMessage(convId, "assistant", fullResponse);
    }

    res.end();

  } catch (error: any) {
    console.error("[Streaming Full Error]:", error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

export { router as chatStreamFullRouter };
