import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("créditos de recarga idempotentes", () => {
  const cwdSpy = vi.spyOn(process, "cwd");
  const tempDirs: string[] = [];

  afterEach(() => {
    cwdSpy.mockRestore();
    vi.resetModules();
    tempDirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
  });

  it("não adiciona créditos duas vezes para a mesma solicitação aprovada", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devai-pix-credits-"));
    tempDirs.push(dir);
    cwdSpy.mockReturnValue(dir);
    const credits = await import("./_core/credits");

    await expect(credits.applyRechargeCredit(12, 60, "pix_teste_1")).resolves.toEqual({ applied: true, balance: 60 });
    await expect(credits.applyRechargeCredit(12, 60, "pix_teste_1")).resolves.toEqual({ applied: false, balance: 60 });
    await expect(credits.getBalance(12)).resolves.toBe(60);
  });
});
