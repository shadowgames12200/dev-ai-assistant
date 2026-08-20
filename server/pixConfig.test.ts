import { describe, expect, it } from "vitest";
import { getPixConfig } from "./pixConfig";

describe("configuração pública de recarga por Pix", () => {
  it("lê as variáveis configuradas no ambiente sem expor valores no código", () => {
    const config = getPixConfig();

    expect(config.key).toMatch(/^[0-9a-f-]{36}$/i);
    expect(config.receiverName.length).toBeGreaterThan(2);
    expect(config.city.length).toBeGreaterThan(1);
    expect(config.ownerEmail).toContain("@");
    expect(config.supportWhatsAppNumber).toMatch(/^55\d{10,11}$/);
  });
});
