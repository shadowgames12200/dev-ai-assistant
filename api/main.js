import dns from 'node:dns';
// Forçar o Node.js a priorizar IPv4 sobre IPv6 para evitar erros de rede no Render (ENETUNREACH)
dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from '../server/routers.js';
import { createContext } from '../server/_core/context.js';
import { registerOAuthRoutes } from '../server/_core/oauth.js';
import { registerLocalAuthRoutes } from '../server/routes/localAuth.js';
import path from 'path';

const app = express();
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// ─── Health & Config Check Route ───
app.get('/api/health', (req, res) => {
  const hasGroqKey = !!process.env.GROQ_API_KEY;
  const groqKeyStarts = hasGroqKey ? (process.env.GROQ_API_KEY.startsWith('gsk_') ? 'valid prefix' : 'invalid prefix') : 'missing';
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    config: {
      groqApiKey: groqKeyStarts,
      databaseUrl: !!process.env.DATABASE_URL ? 'configured' : 'missing',
      nodeEnv: process.env.NODE_ENV,
    },
  });
});

// Registrar rotas de autenticação (Supabase Callback + Local Auth)
registerOAuthRoutes(app);
registerLocalAuthRoutes(app);

// ─── tRPC Router ───
app.use(
  '/api/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ path, error }) {
      console.error(`[tRPC Error] ${path}:`, error.message);
      console.error(error.stack || '');
    },
  })
);

// ─── Static Files ───
const distPath = path.resolve(process.cwd(), 'dist/public');
app.use(express.static(distPath));

// ─── SPA Fallback ───
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return;
  res.sendFile(path.join(distPath, 'index.html'));
});

export default app;
