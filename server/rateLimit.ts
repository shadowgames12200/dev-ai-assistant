import { TRPCError } from "@trpc/server";

export const RATE_LIMIT_WINDOW_MS = 60_000;
export const CHAT_REQUESTS_PER_WINDOW = 20;
export const UPLOAD_REQUESTS_PER_WINDOW = 10;

type RateLimitEntry = { count: number; resetAt: number };
const userRateLimits = new Map<string, RateLimitEntry>();

/**
 * Mitigação in-memory por instância. Em Vercel multi-instância não substitui
 * um limitador persistente/edge, mas reduz abuso dentro de cada processo.
 */
export function enforceUserRateLimit(userId: number, action: "chat" | "upload", limit: number): void {
  const now = Date.now();
  const key = `${action}:${userId}`;
  const current = userRateLimits.get(key);
  const next = !current || current.resetAt <= now
    ? { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS }
    : { count: current.count + 1, resetAt: current.resetAt };
  userRateLimits.set(key, next);

  if (userRateLimits.size > 1_000) {
    for (const [entryKey, entry] of Array.from(userRateLimits.entries())) {
      if (entry.resetAt <= now) userRateLimits.delete(entryKey);
    }
  }

  if (next.count > limit) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Muitas solicitações em pouco tempo. Aguarde um minuto e tente novamente.",
    });
  }
}

/** Exclusivo para testes, sem expor o estado ao cliente. */
export function resetUserRateLimitsForTests(): void {
  userRateLimits.clear();
}
