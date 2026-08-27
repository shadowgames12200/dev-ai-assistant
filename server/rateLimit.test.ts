import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_REQUESTS_PER_WINDOW,
  RATE_LIMIT_WINDOW_MS,
  UPLOAD_REQUESTS_PER_WINDOW,
  enforceUserRateLimit,
  resetUserRateLimitsForTests,
} from "./rateLimit";

describe("rate limit por usuário", () => {
  afterEach(() => {
    resetUserRateLimitsForTests();
    vi.useRealTimers();
  });

  it("permite até o limite de chat e rejeita a próxima chamada", () => {
    for (let attempt = 0; attempt < CHAT_REQUESTS_PER_WINDOW; attempt += 1) {
      expect(() => enforceUserRateLimit(7, "chat", CHAT_REQUESTS_PER_WINDOW)).not.toThrow();
    }

    expect(() => enforceUserRateLimit(7, "chat", CHAT_REQUESTS_PER_WINDOW)).toThrowError(
      expect.objectContaining({ code: "TOO_MANY_REQUESTS" }),
    );
  });

  it("mantém janelas separadas por usuário e ação", () => {
    for (let attempt = 0; attempt < UPLOAD_REQUESTS_PER_WINDOW; attempt += 1) {
      enforceUserRateLimit(7, "upload", UPLOAD_REQUESTS_PER_WINDOW);
    }

    expect(() => enforceUserRateLimit(7, "upload", UPLOAD_REQUESTS_PER_WINDOW)).toThrowError(
      expect.objectContaining({ code: "TOO_MANY_REQUESTS" }),
    );
    expect(() => enforceUserRateLimit(8, "upload", UPLOAD_REQUESTS_PER_WINDOW)).not.toThrow();
    expect(() => enforceUserRateLimit(7, "chat", CHAT_REQUESTS_PER_WINDOW)).not.toThrow();
  });

  it("reinicia a janela depois de um minuto", () => {
    vi.useFakeTimers();
    for (let attempt = 0; attempt < UPLOAD_REQUESTS_PER_WINDOW; attempt += 1) {
      enforceUserRateLimit(7, "upload", UPLOAD_REQUESTS_PER_WINDOW);
    }
    expect(() => enforceUserRateLimit(7, "upload", UPLOAD_REQUESTS_PER_WINDOW)).toThrow();

    vi.advanceTimersByTime(RATE_LIMIT_WINDOW_MS + 1);
    expect(() => enforceUserRateLimit(7, "upload", UPLOAD_REQUESTS_PER_WINDOW)).not.toThrow();
  });
});
