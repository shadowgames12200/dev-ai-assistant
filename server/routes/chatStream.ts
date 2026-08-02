import { Router } from 'express';
import { streamChat } from '../_core/groq.js';

export const chatStreamRouter = Router();

chatStreamRouter.post('/api/chat/stream', async (req, res) => {
  const { messages } = req.body;
  
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Mensagens inválidas' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await streamChat(messages);
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }
    
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Erro no streaming do JARVIS:', error);
    res.write(`data: ${JSON.stringify({ error: 'Erro ao processar fala' })}\n\n`);
    res.end();
  }
});
