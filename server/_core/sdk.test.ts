import { afterEach, describe, expect, it, vi } from "vitest";
import { sdk } from "./sdk";

describe("verificação de sessão", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("trata uma visita sem cookie como sessão anônima, sem aviso de erro", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(sdk.verifySession(undefined)).resolves.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
