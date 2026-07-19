import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import * as db from "../db.js";
import { getSessionCookieOptions } from "./cookies.js";
import { sdk } from "./sdk.js";
import { supabase } from "./supabase.js";

async function handleSupabaseCallback(req: any, res: any, accessToken: string, refreshToken?: string, isRedirect = false) {
  try {
    // @ts-ignore
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      throw new Error(error?.message || "User not found");
    }

    await db.upsertUser({
      openId: user.id,
      name: user.user_metadata?.full_name || user.email?.split('@')[0] || "Usuário",
      email: user.email ?? null,
      loginMethod: user.app_metadata?.provider || "email",
      role: (user.app_metadata?.role === 'admin' || user.app_metadata?.role === 'user') ? user.app_metadata.role : undefined,
      lastSignedIn: new Date(),
    });

    const sessionToken = await sdk.createSessionToken(user.id, {
      name: user.user_metadata?.full_name || user.email || "",
      expiresInMs: ONE_YEAR_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    // @ts-ignore
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

    if (isRedirect) {
      // @ts-ignore
      res.redirect("/");
    } else {
      // @ts-ignore
      res.json({ success: true, user: { id: user.id, email: user.email } });
    }
  } catch (error: any) {
    if (isRedirect) {
      // @ts-ignore
      res.redirect("/?error=auth_failed");
    } else {
      // @ts-ignore
      res.status(500).json({ error: "Auth sync failed" });
    }
  }
}

export function registerOAuthRoutes(app: any) {
  // @ts-ignore
  app.post("/api/auth/supabase-callback", async (req: any, res: any) => {
    const { access_token, refresh_token } = req.body;
    if (!access_token) {
      res.status(400).json({ error: "access_token is required" });
      return;
    }
    await handleSupabaseCallback(req, res, access_token, refresh_token);
  });

  // @ts-ignore
  app.get("/api/auth/supabase-callback", (req: any, res: any) => {
    res.send(`<!DOCTYPE html><html><body><script>
      (async function() {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const access_token = params.get('access_token');
        if (access_token) {
          const response = await fetch('/api/auth/supabase-callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token })
          });
          window.location.href = response.ok ? '/' : '/?error=auth_failed';
        }
      })();
    </script></body></html>`);
  });

  // @ts-ignore
  app.post("/api/auth/logout", (req: any, res: any) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: 0 });
    res.json({ success: true });
  });
}
