import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildStaticPixBrCode, internalPixCrc16 } from "./pixBrCode";
import { getPixPackage, PIX_PACKAGES } from "./pixConfig";

describe("BR Code Pix estático", () => {
  beforeEach(() => {
    vi.stubEnv("PIX_KEY", "bc283cd0-627c-4e93-acfa-bf0e1733428d");
    vi.stubEnv("PIX_RECEIVER_NAME", "Charles Henrique Gonçalves dos Santos");
    vi.stubEnv("PIX_CITY", "Pirapora");
    vi.stubEnv("OWNER_NOTIFICATION_EMAIL", "owner@example.com");
    vi.stubEnv("SUPPORT_WHATSAPP_NUMBER", "5538991109806");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("gera um payload Pix com valor, TXID não reutilizável e CRC16 válido", () => {
    const pkg = getPixPackage("basico");
    expect(pkg).toEqual(PIX_PACKAGES[0]);
    const brCode = buildStaticPixBrCode(pkg!);

    expect(brCode).toContain("000201");
    expect(brCode).toContain("0014BR.GOV.BCB.PIX");
    expect(brCode).toContain("540510.00");
    expect(brCode).toContain("0503***");
    expect(brCode.slice(-8, -4)).toBe("6304");
    expect(brCode.slice(-4)).toBe(internalPixCrc16(brCode.slice(0, -4)));
  });

  it("não aceita identificador de pacote que não exista", () => {
    expect(getPixPackage("nao-existe")).toBeNull();
  });
});
