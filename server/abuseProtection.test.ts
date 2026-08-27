import { afterEach, describe, expect, it } from "vitest";
import {
  ABUSE_SIGNAL_WINDOW_MS,
  AUTO_BLOCK_SIGNAL_THRESHOLD,
  getAccountBlockState,
  getRegistrationCount,
  recordSuccessfulRegistration,
  registerUserAbuseSignal,
  resetAbuseProtectionForTests,
} from "./abuseProtection";

const request = (ip = "198.51.100.10") => ({
  ip,
  headers: {},
  socket: { remoteAddress: ip },
}) as any;

afterEach(() => resetAbuseProtectionForTests());

describe("proteção contra abuso", () => {
  it("só recomenda bloqueio temporário após o limiar de sinais na janela", () => {
    const now = 1_800_000_000_000;
    expect(registerUserAbuseSignal(7, "chat_rate_limit", now).shouldTemporarilyBlock).toBe(false);
    expect(registerUserAbuseSignal(7, "upload_rate_limit", now + 1).shouldTemporarilyBlock).toBe(false);
    const result = registerUserAbuseSignal(7, "chat_rate_limit", now + 2);

    expect(result.count).toBe(AUTO_BLOCK_SIGNAL_THRESHOLD);
    expect(result.shouldTemporarilyBlock).toBe(true);
    expect(result.signals).toEqual(["chat_rate_limit", "upload_rate_limit"]);
  });

  it("descarta sinais fora da janela", () => {
    const now = 1_800_000_000_000;
    registerUserAbuseSignal(7, "chat_rate_limit", now);
    const result = registerUserAbuseSignal(7, "upload_rate_limit", now + ABUSE_SIGNAL_WINDOW_MS + 1);

    expect(result.count).toBe(1);
    expect(result.shouldTemporarilyBlock).toBe(false);
  });

  it("interpreta bloqueio permanente, temporário válido e temporário expirado", () => {
    const now = 1_800_000_000_000;
    expect(getAccountBlockState({ accountStatus: "blocked", blockedReason: "manual" }, now)).toMatchObject({ blocked: true, permanent: true });
    expect(getAccountBlockState({ accountStatus: "temporarily_blocked", blockedUntil: new Date(now + 1000), blockedReason: "rate" }, now)).toMatchObject({ blocked: true, permanent: false });
    expect(getAccountBlockState({ accountStatus: "temporarily_blocked", blockedUntil: new Date(now - 1), blockedReason: "rate" }, now)).toMatchObject({ blocked: false, permanent: false });
  });

  it("limita novos cadastros por origem sem bloquear a conta proprietária", () => {
    const req = request();
    const now = 1_800_000_000_000;
    expect(getRegistrationCount(req, now)).toBe(0);
    expect(recordSuccessfulRegistration(req, now)).toBe(1);
    expect(recordSuccessfulRegistration(req, now + 1)).toBe(2);
    expect(recordSuccessfulRegistration(req, now + 2)).toBe(3);
    expect(getRegistrationCount(req, now + 3)).toBe(3);
  });
});
