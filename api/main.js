import dns from 'node:dns';
// Forçar o Node.js a priorizar IPv4 sobre IPv6 para evitar erros de rede no Render (ENETUNREACH)
dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from '../server/routers.js';
import { createContext } from '../server/_core/context.js';
import { registerOAuthRoutes } from '../server/_core/oauth.js';
import path from 'path';

const app = express();
app.use(express.json());

// Registrar rotas de autenticação (Supabase Callback)
registerOAuthRoutes(app);

app.use(
  '/api/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

const distPath = path.resolve(process.cwd(), 'dist/public');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return;
  res.sendFile(path.join(distPath, 'index.html'));
});

export default app;
