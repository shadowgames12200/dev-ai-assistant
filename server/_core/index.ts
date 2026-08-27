// import "dotenv/config";
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

if (process.argv.includes("--build-only")) {
  console.log("Build check passed");
  process.exit(0);
}

const app = express();
app.disable("x-powered-by");
app.use((_req: any, res: any, next: any) => {
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
app.post("/api/auth/login", requireTrustedMutationOrigin, handleLocalLogin);
app.post("/api/auth/register", requireTrustedMutationOrigin, handleLocalRegister);
app.post("/api/auth/account", requireTrustedMutationOrigin, handleLocalAccountUpdate);
app.post("/api/auth/logout", requireTrustedMutationOrigin, handleLocalLogout);

function requireTrustedMutationOrigin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!isTrustedMutationOrigin(req)) {
    res.status(403).json({ error: "Origem não autorizada" });
    return;
  }
  next();
}

function isTrustedMutationOrigin(req: express.Request): boolean {
  const origin = req.get("origin");
  const referer = req.get("referer");
  if (!origin && !referer) return true;

  const forwardedHost = req.get("x-forwarded-host");
  const host = forwardedHost?.split(",")[0]?.trim() || req.get("host");
  const allowedOrigins = new Set([
    `https://${host}`,
    `http://${host}`,
    "https://dev-ai-assistant-puce.vercel.app",
    process.env.APP_URL?.replace(/\/$/, ""),
  ].filter(Boolean));

  if (origin) return allowedOrigins.has(origin.replace(/\/$/, ""));
  try {
    return allowedOrigins.has(new URL(referer!).origin);
  } catch {
    return false;
  }
}

// tRPC API. POST carrega mutações e é protegido contra origem cross-site.
app.use("/api/trpc", (req, res, next) => {
  if (req.method === "POST") return requireTrustedMutationOrigin(req, res, next);
  next();
});

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

export { app };
export default app;
