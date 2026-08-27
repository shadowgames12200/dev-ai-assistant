import type { Request } from "express";

export const TEMPORARY_BLOCK_DURATION_MS = 30 * 60 * 1000;
export const ABUSE_SIGNAL_WINDOW_MS = 15 * 60 * 1000;
export const AUTO_BLOCK_SIGNAL_THRESHOLD = 3;
export const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
export const REGISTRATION_LIMIT_PER_SOURCE = 3;

export type AccountStatus = "active" | "temporarily_blocked" | "blocked";

export type AccountBlockState = {
  blocked: boolean;
  permanent: boolean;
  until: Date | null;
  reason: string | null;
};

type UserWithBlockState = {
  accountStatus?: AccountStatus | null;
  blockedUntil?: Date | string | null;
  blockedReason?: string | null;
};

type SignalBucket = {
  events: Array<{ at: number; signal: string }>;
};

const userSignals = new Map<number, SignalBucket>();
const sourceRegistrations = new Map<string, number[]>();

function pruneEvents(events: number[], now: number, windowMs: number): number[] {
  return events.filter(eventAt => eventAt > now - windowMs);
}

export function getAccountBlockState(user: UserWithBlockState, now = Date.now()): AccountBlockState {
  if (user.accountStatus === "blocked") {
    return { blocked: true, permanent: true, until: null, reason: user.blockedReason ?? null };
  }

  const until = user.blockedUntil ? new Date(user.blockedUntil) : null;
  if (user.accountStatus === "temporarily_blocked" && until && until.getTime() > now) {
    return { blocked: true, permanent: false, until, reason: user.blockedReason ?? null };
  }

  return { blocked: false, permanent: false, until: null, reason: null };
}

export function registerUserAbuseSignal(
  userId: number,
  signal: string,
  now = Date.now(),
): { count: number; shouldTemporarilyBlock: boolean; signals: string[] } {
  const bucket = userSignals.get(userId) ?? { events: [] };
  bucket.events = bucket.events.filter(event => event.at > now - ABUSE_SIGNAL_WINDOW_MS);
  bucket.events.push({ at: now, signal });
  userSignals.set(userId, bucket);

  return {
    count: bucket.events.length,
    shouldTemporarilyBlock: bucket.events.length >= AUTO_BLOCK_SIGNAL_THRESHOLD,
    signals: Array.from(new Set(bucket.events.map(event => event.signal))),
  };
}

export function getRegistrationCount(
  req: Pick<Request, "ip" | "headers" | "socket">,
  now = Date.now(),
): number {
  const source = getRequestSource(req);
  const events = pruneEvents(sourceRegistrations.get(source) ?? [], now, REGISTRATION_WINDOW_MS);
  sourceRegistrations.set(source, events);
  return events.length;
}

export function recordSuccessfulRegistration(
  req: Pick<Request, "ip" | "headers" | "socket">,
  now = Date.now(),
): number {
  const source = getRequestSource(req);
  const events = pruneEvents(sourceRegistrations.get(source) ?? [], now, REGISTRATION_WINDOW_MS);
  events.push(now);
  sourceRegistrations.set(source, events);
  return events.length;
}

function isLoopbackAddress(value: unknown): boolean {
  return value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1";
}

export function getRequestSource(req: Pick<Request, "ip" | "headers" | "socket">): string {
  const peerAddress = req.socket?.remoteAddress || req.ip || "unknown";
  const realIp = typeof req.headers?.["x-real-ip"] === "string" ? req.headers["x-real-ip"].trim() : "";
  return isLoopbackAddress(peerAddress) && realIp ? realIp : peerAddress;
}

export function getSupportLinks() {
  const whatsappNumber = process.env.SUPPORT_WHATSAPP_NUMBER?.trim() || "";
  const configuredWhatsAppUrl = process.env.SUPPORT_WHATSAPP_URL?.trim() || "";
  const whatsappUrl = configuredWhatsAppUrl || (whatsappNumber ? `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, "")}` : null);
  const discordUrl = process.env.SUPPORT_DISCORD_URL?.trim() || null;
  const email = process.env.SUPPORT_EMAIL?.trim() || process.env.OWNER_NOTIFICATION_EMAIL?.trim() || null;

  return {
    whatsappUrl,
    discordUrl,
    email,
  };
}

export function buildBlockMessage(state: AccountBlockState): string {
  if (!state.blocked) return "";
  if (state.permanent) {
    return "Conta bloqueada. Solicite uma revisão pelo suporte.";
  }
  const until = state.until ? ` até ${state.until.toLocaleString("pt-BR")}` : " temporariamente";
  return `Conta temporariamente bloqueada${until}. Solicite uma revisão pelo suporte.`;
}

export function resetAbuseProtectionForTests() {
  userSignals.clear();
  sourceRegistrations.clear();
}
