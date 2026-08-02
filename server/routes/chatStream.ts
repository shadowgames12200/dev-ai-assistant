import { Router } from "express";
import { invokeGroq } from "../_core/groq.js";
import * as db from "../db.js";

const router = Router();

/**
 * Rota de streaming de chat otimizada para voz
 * Respostas curtas e diretas, sem markdown excessivo
 */
router.get("/api/chat/stream", async (req, res) => {
  try {
    const { conversationId, content } = req.query;

    if (!conversationId || !content) {
      return res.status(400).json({ error: "Missing conversationId or content" });
    }

    const convId = parseInt(conversationId as string, 10);
    const userMessage = content as string;

    // Configurar os cabeçalhos para SSE (Server-Sent Events)
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Buscar mensagens anteriores da conversa
    const dbMessages = await db.getConversationMessages(convId);
    
    // Formatar as mensagens para o Groq
    const messages = dbMessages.map(msg => ({
      role: msg.role as "system" | "user" | "assistant",
      content: msg.content
    }));

    // Adicionar a nova mensagem do usuário
    messages.push({
      role: "user",
      content: userMessage
    });

    // Adicionar a mensagem do sistema caso não exista
    if (!messages.some(m => m.role === "system")) {
      messages.unshift({
        role: "system",
        content: `Você é J.A.R.V.I.S., um assistente de IA focado em respostas curtas, diretas e naturais para fala. 
        
Diretrizes importantes:
- Respostas devem ser concisas (máximo 2-3 frases)
- Não use markdown excessivo, listas longas ou código a menos que estritamente necessário
- Suas respostas serão lidas em voz alta, então use linguagem natural e conversacional
- Seja sempre educado e profissional, como um assistente de elite
- Se o usuário disser "Dev", remova essa palavra do contexto e responda apenas ao comando
- Evite repetir a pergunta, vá direto ao ponto
- Se não souber algo, diga claramente em vez de adivinhar`
      });
    }

    // Invocar o Groq com streaming
    const stream = await invokeGroq({
      messages,
      stream: true,
      maxTokens: 300, 
      temperature: 0.7
    });

    if (!(stream instanceof ReadableStream)) {
      throw new Error("Expected a stream response from Groq");
    }

    const reader = stream.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullResponse = "";
    let tokenCount = 0;

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
              tokenCount++;
              res.write(`data: ${JSON.stringify({ token })}\n\n`);
            }
          } catch (e) {
            console.error("Error parsing stream chunk:", e);
          }
        }
      }
    }

    res.end();

  } catch (error: any) {
    console.error("[Streaming Error]:", error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

export { router as chatStreamRouter };
