import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import type { Express, Request, Response } from "express";
import * as db from "../db.js";
import { getSessionCookieOptions } from "./cookies.js";
import { sdk } from "./sdk.js";
import { supabase } from "./supabase.js";

async function handleSupabaseCallback(req: Request, res: Response, accessToken: string, refreshToken?: string, isRedirect = false) {
  try {
    // Validar o token com o Supabase
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      throw new Error(error?.message || "User not found in Supabase");
    }

    // Upsert do usuário no nosso banco local
    await db.upsertUser({
      openId: user.id,
      name: user.user_metadata?.full_name || user.email?.split('@')[0] || "Usuário",
      email: user.email ?? null,
      loginMethod: user.app_metadata?.provider || "email",
      role: (user.app_metadata?.role === 'admin' || user.app_metadata?.role === 'user') ? user.app_metadata.role : undefined,
      lastSignedIn: new Date(),
    });

    // Verificar se o usuário foi criado com sucesso no banco
    const dbUser = await db.getUserByOpenId(user.id);
    if (!dbUser) {
      throw new Error("Falha ao criar usuário no banco de dados");
    }

    // Criar o token de sessão da nossa aplicação
    const sessionToken = await sdk.createSessionToken(user.id, {
      name: user.user_metadata?.full_name || user.email || "",
      expiresInMs: ONE_YEAR_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

    if (isRedirect) {
      res.redirect("/");
    } else {
      res.json({ success: true, user: { id: user.id, email: user.email } });
    }
  } catch (error: any) {
    console.error("[Auth] Supabase callback failed:", error.message || error);
    if (isRedirect) {
      res.redirect("/?error=auth_failed");
    } else {
      res.status(500).json({ error: "Auth sync failed" });
    }
  }
}

export function registerOAuthRoutes(app: Express) {
  /**
   * Supabase Auth Callback (POST) - usado pelo login com email/senha
   * Este endpoint recebe a sessão do Supabase e cria o cookie da aplicação.
   */
  app.post("/api/auth/supabase-callback", async (req: Request, res: Response) => {
    const { access_token, refresh_token } = req.body;

    if (!access_token) {
      res.status(400).json({ error: "access_token is required" });
      return;
    }

    await handleSupabaseCallback(req, res, access_token, refresh_token);
  });

  /**
   * Supabase Auth Callback (GET) - usado pelo login social (Google, Microsoft)
   * O Supabase redireciona para cá com o token no fragmento da URL (#access_token=...)
   * ou como query param (?code=...). Esta rota serve o HTML que extrai o token e chama o POST.
   */
  app.get("/api/auth/supabase-callback", (req: Request, res: Response) => {
    // Servir uma página HTML que extrai o token do fragmento da URL e faz POST
    res.send(`<!DOCTYPE html>
<html>
<head><title>Autenticando...</title></head>
<body>
<script>
  (async function() {
    try {
      // Extrair tokens do fragmento da URL (OAuth implicit flow)
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');

      if (access_token) {
        const response = await fetch('/api/auth/supabase-callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ access_token, refresh_token })
        });
        if (response.ok) {
          window.location.href = '/';
        } else {
          window.location.href = '/?error=auth_failed';
        }
      } else {
        window.location.href = '/?error=no_token';
      }
    } catch(e) {
      window.location.href = '/?error=auth_exception';
    }
  })();
</script>
<p>Autenticando, aguarde...</p>
</body>
</html>`);
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: 0 });
    res.json({ success: true });
  });
}
