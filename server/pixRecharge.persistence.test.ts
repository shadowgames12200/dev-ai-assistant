import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("persistência de solicitações Pix", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.resetModules();
    delete process.env.DATA_DIR;
    tempDirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
  });

  it("reaproveita a solicitação pendente e registra aprovação ou rejeição", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devai-pix-"));
    tempDirs.push(dir);
    process.env.DATA_DIR = dir;
    const db = await import("./db");

    const first = db.createRechargeRequest({ userId: 7, userEmail: "cliente@example.com", packageId: "basico", amountCents: 1000, credits: 25 });
    const samePending = db.createRechargeRequest({ userId: 7, userEmail: "cliente@example.com", packageId: "basico", amountCents: 1000, credits: 25 });
    expect(samePending.id).toBe(first.id);
    expect(db.listRechargeRequests("pending")).toHaveLength(1);

    const approved = db.markRechargeApproved(first.id, 1);
    expect(approved?.status).toBe("approved");
    expect(approved?.decidedByUserId).toBe(1);
    expect(db.markRechargeRejected(first.id, 1)).toBeNull();
  });
});
