import { createExpressMiddleware } from '@trpc/server/adapters/express';
import express from 'express';
import path from 'path';
import { appRouter } from '../dist/server/routers';
import { createContext } from '../dist/server/_core/context';
const app = express();
app.use(expresson());
// tRPC API
app.use(
  '/api/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);
// Serve static files from the 'dist' directory
const distPath = path.resolve(process.cwd(), 'dist/public');
app.use(express.static(distPath));
// Handle client-side routing, return all requests to the app
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return;
  res.sendFile(path.join(distPath, 'index.html'));
});
export default app;
