import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import type { Express, Request, Response } from "express";
import * as db from "../db.js";
import { getSessionCookieOptions } from "./cookies.js";
import { sdk } from "./sdk.js";
import { supabase } from "./supabase.js";

export function registerOAuthRoutes(app: Express) {
  /**
   * Supabase Auth Callback
   * Este endpoint recebe a sessão do Supabase e cria o cookie da aplicação.
   */
  app.post("/api/auth/supabase-callback", async (req: Request, res: Response) => {
    const { access_token, refresh_token } = req.body;

    if (!access_token) {
      res.status(400).json({ error: "access_token is required" });
      return;
    }

    try {
      // Validar o token com o Supabase
      const { data: { user }, error } = await supabase.auth.getUser(access_token);

      if (error || !user) {
        throw new Error(error?.message || "User not found in Supabase");
      }

      // Upsert do usuário no nosso banco local
      await db.upsertUser({
        openId: user.id,
        name: user.user_metadata?.full_name || user.email?.split('@')[0] || "Usuário",
        email: user.email ?? null,
        loginMethod: user.app_metadata?.provider || "email",
        lastSignedIn: new Date(),
      });

      // Criar o token de sessão da nossa aplicação
      const sessionToken = await sdk.createSessionToken(user.id, {
        name: user.user_metadata?.full_name || user.email || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ success: true, user: { id: user.id, email: user.email } });
    } catch (error) {
      console.error("[Auth] Supabase callback failed", error);
      res.status(500).json({ error: "Auth sync failed" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: 0 });
    res.json({ success: true });
  });
}
