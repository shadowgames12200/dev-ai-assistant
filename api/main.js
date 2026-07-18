import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from '../dist/server/routers.js';
import { createContext } from '../dist/server/_core/context.js';
const app = express();
app.use(express.json());
app.use(
  '/api/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);
export default app;
