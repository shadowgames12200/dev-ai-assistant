import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { handleLocalAccountUpdate, handleLocalLogin, handleLocalLogout, handleLocalRegister } from "../localAuth";
import { serveStatic, setupVite } from "./vite";
import { ENV } from "./env";

const app = express();
app.disable("x-powered-by");
app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https:; connect-src 'self' https: http: ws: wss:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"
  );
  next();
});

// Configure body parser with larger size limit for file uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
registerStorageProxy(app);

if (ENV.oAuthServerUrl) {
  registerOAuthRoutes(app);
}

// Autenticação local por conta e senha
app.post("/api/auth/login", handleLocalLogin);
app.post("/api/auth/register", handleLocalRegister);
app.post("/api/auth/account", handleLocalAccountUpdate);
app.post("/api/auth/logout", handleLocalLogout);

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
  const server = createServer(app);
  setupVite(app, server).catch(console.error);
  
  const preferredPort = parseInt(process.env.PORT || "3000");
  
  const isPortAvailable = (port: number): Promise<boolean> => {
    return new Promise(resolve => {
      const s = net.createServer();
      s.listen(port, () => {
        s.close(() => resolve(true));
      });
      s.on("error", () => resolve(false));
    });
  };

  const findAvailablePort = async (startPort: number = 3000): Promise<number> => {
    for (let port = startPort; port < startPort + 20; port++) {
      if (await isPortAvailable(port)) {
        return port;
      }
    }
    return startPort;
  };

  findAvailablePort(preferredPort).then(port => {
    server.listen(port, () => {
      console.log(`Server running on http://localhost:${port}/`);
    });
  });
} else {
  serveStatic(app);
}

export default app;
