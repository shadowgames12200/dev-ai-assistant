import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import * as db from "../db.js";
import { getSessionCookieOptions } from "../_core/cookies.js";
import { sdk } from "../_core/sdk.js";
import { createHmac } from "crypto";

// Simple password hashing using HMAC (for this app's purposes)
function hashPassword(password: string, salt: string): string {
  return createHmac("sha256", salt).update(password).digest("hex");
}

function generateSalt(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// In-memory password store (fallback when DB is not available)
const passwordStore: Map<string, { passwordHash: string; salt: string }> = new Map();

export function registerLocalAuthRoutes(app: any) {
  /**
   * POST /api/auth/login - Login ou cadastro automático
   * Se o usuário não existir, cria automaticamente.
   * Se existir, valida a senha e faz login.
   */
  // @ts-ignore
  app.post("/api/auth/login", async (req: any, res: any) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: "Email e senha são obrigatórios" });
        return;
      }

      if (typeof email !== "string" || typeof password !== "string") {
        res.status(400).json({ error: "Email e senha devem ser strings" });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();
      const name = normalizedEmail.split("@")[0];
      const openId = `local:${normalizedEmail}`;

      // Check if user already has a stored password
      const storedPassword = passwordStore.get(normalizedEmail);

      if (storedPassword) {
        // User exists in our password store - validate password
        const hash = hashPassword(password, storedPassword.salt);
        if (hash !== storedPassword.passwordHash) {
          res.status(401).json({ error: "Email ou senha inválidos" });
          return;
        }
      } else {
        // New user - auto-register
        console.log("[Auth] Auto-registering new user:", normalizedEmail);
        const salt = generateSalt();
        const passwordHash = hashPassword(password, salt);
        passwordStore.set(normalizedEmail, { passwordHash, salt });
      }

      // Upsert user in database
      await db.upsertUser({
        openId,
        name,
        email: normalizedEmail,
        loginMethod: "email",
        role: "user",
        lastSignedIn: new Date(),
      });

      // Get user from DB
      const dbUser = await db.getUserByOpenId(openId);
      if (!dbUser) {
        console.error("[Auth] Failed to get user after upsert");
        res.status(500).json({ error: "Falha ao autenticar usuário" });
        return;
      }

      // Create session token
      const sessionToken = await sdk.createSessionToken(dbUser.openId, {
        name: dbUser.name || name,
        expiresInMs: ONE_YEAR_MS,
      });

      // Set cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({
        success: true,
        user: {
          id: dbUser.id,
          openId: dbUser.openId,
          name: dbUser.name,
          email: dbUser.email,
          role: dbUser.role,
        },
      });
    } catch (error: any) {
      console.error("[Auth] Local login error:", error);
      res.status(500).json({ error: "Erro interno do servidor" });
    }
  });

  /**
   * POST /api/auth/logout - Logout
   */
  // @ts-ignore
  app.post("/api/auth/logout", (req: any, res: any) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: 0 });
    res.json({ success: true });
  });
}
