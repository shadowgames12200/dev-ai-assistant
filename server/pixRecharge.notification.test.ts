import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

const notifyOwner = vi.hoisted(() => vi.fn());

vi.mock("./_core/notification", () => ({ notifyOwner }));

describe("alerta operacional de recarga Pix", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.resetModules();
    notifyOwner.mockReset();
    delete process.env.DATA_DIR;
    tempDirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
  });

  it("registra a solicitação e informa quando o alerta ao proprietário foi aceito", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devai-pix-notify-"));
    tempDirs.push(dir);
    process.env.DATA_DIR = dir;
    notifyOwner.mockResolvedValueOnce(true);

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({
      req: {} as any,
      res: {} as any,
      user: { id: 51, email: "cliente@exemplo.com", role: "user" } as any,
    });

    const result = await caller.pix.requestRecharge({ packageId: "basico" });

    expect(result.success).toBe(true);
    expect(result.ownerNotified).toBe(true);
    expect(notifyOwner).toHaveBeenCalledWith(expect.objectContaining({
      title: "Nova solicitação de recarga Pix",
      content: expect.stringContaining("25 créditos"),
    }));
  });

  it("mantém a solicitação pendente quando o canal de alerta está indisponível", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devai-pix-notify-"));
    tempDirs.push(dir);
    process.env.DATA_DIR = dir;
    notifyOwner.mockResolvedValueOnce(false);

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({
      req: {} as any,
      res: {} as any,
      user: { id: 52, email: "cliente2@exemplo.com", role: "user" } as any,
    });

    const result = await caller.pix.requestRecharge({ packageId: "basico" });

    expect(result.success).toBe(true);
    expect(result.ownerNotified).toBe(false);
    expect(result.request.status).toBe("pending");
  });
});
