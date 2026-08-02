import { Router } from 'express';
import { invokeGroq } from '../_core/groq.js';

export const chatStreamRouter = Router();

chatStreamRouter.post('/api/chat/stream', async (req: any, res: any) => {
  const { messages } = req.body;
  
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Mensagens inválidas' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await invokeGroq({ messages, stream: true }) as any;
    
    // O stream do fetch (ReadableStream) precisa ser lido via reader
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim() === '') continue;
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n');
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content || '';
            if (content) {
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch (e) {
            // Ignorar erros de parse parciais
          }
        }
      }
    }
    
    res.end();
  } catch (error) {
    console.error('Erro no streaming do JARVIS:', error);
    res.write(`data: ${JSON.stringify({ error: 'Erro ao processar fala' })}\n\n`);
    res.end();
  }
});
