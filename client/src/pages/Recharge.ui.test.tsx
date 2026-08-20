// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Recharge from "./Recharge";

const copyPix = vi.fn();
const requestRecharge = vi.fn();
const invalidateRequests = vi.fn();

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,qr") } }));
vi.mock("wouter", () => ({ useLocation: () => ["/recharge", vi.fn()] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ pix: { myRequests: { invalidate: invalidateRequests } } }),
    pix: {
      packages: { useQuery: () => ({ data: { receiverName: "Charles Henrique", city: "Pirapora", supportWhatsAppNumber: "5538991109806", packages: [
        { id: "basico", label: "Pacote básico", amountCents: 1000, amount: "10.00", credits: 25, brCode: "BR-CODE-10" },
        { id: "avancado", label: "Pacote avançado", amountCents: 5000, amount: "50.00", credits: 180, brCode: "BR-CODE-50" },
      ] } }) },
      myRequests: { useQuery: () => ({ data: { requests: [] } }) },
      requestRecharge: { useMutation: () => ({ mutate: requestRecharge, isPending: false }) },
    },
  },
}));

describe("página de recarga Pix", () => {
  beforeEach(() => {
    copyPix.mockReset();
    requestRecharge.mockReset();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copyPix.mockResolvedValue(undefined) } });
  });

  it("permite selecionar pacote, copiar o BR Code e registrar apenas a solicitação manual", async () => {
    render(<Recharge />);

    expect(screen.getByText("Liberação manual por segurança.")).toBeVisible();
    expect(screen.getByRole("button", { name: /Pacote básico/i })).toBeVisible();
    expect(screen.getByDisplayValue("BR-CODE-10")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("img", { name: /QR Code Pix de R\$ 10,00/i })).toHaveAttribute("src", "data:image/png;base64,qr"));

    fireEvent.click(screen.getByRole("button", { name: /Pacote avançado/i }));
    expect(screen.getByDisplayValue("BR-CODE-50")).toBeVisible();
    expect(screen.getByText("180 créditos por R$ 50,00")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /Copiar código Pix/i }));
    await waitFor(() => expect(copyPix).toHaveBeenCalledWith("BR-CODE-50"));

    fireEvent.click(screen.getByRole("button", { name: /Já paguei — solicitar conferência/i }));
    expect(requestRecharge).toHaveBeenCalledWith({ packageId: "avancado" });
  });
});
