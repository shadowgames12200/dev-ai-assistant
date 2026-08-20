// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Admin from "./Admin";

const addCredits = vi.fn();
const createLearningProposal = vi.fn();
const approveRecharge = vi.fn();
const rejectRecharge = vi.fn();
const pendingRecharges = vi.hoisted(() => ({ requests: [] as Array<{ id: string; userEmail: string; amountCents: number; credits: number; createdAt: number }> }));
const { authState } = vi.hoisted(() => ({
  authState: { user: { id: 1, role: "admin" } as { id: number; role: "admin" | "user" } },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      credits: { list: { invalidate: vi.fn() }, getCost: { invalidate: vi.fn() } },
      admin: { listUsers: { invalidate: vi.fn() } },
      selfImprove: { list: { invalidate: vi.fn() }, opportunities: { invalidate: vi.fn() } },
      pix: { listPending: { invalidate: vi.fn() } },
    }),
    admin: {
      listUsers: {
        useQuery: () => ({
          data: [
            { id: 1, email: "dono@exemplo.com", name: "Dono", role: "admin", loginMethod: "email" },
            { id: 2, email: "cliente@exemplo.com", name: "Cliente", role: "user", loginMethod: "email" },
          ],
          isLoading: false,
        }),
      },
      setUserRole: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    credits: {
      list: { useQuery: () => ({ data: [{ id: 2, balance: 17 }] }) },
      getCost: { useQuery: () => ({ data: { costPerMessage: 1 } }) },
      setCost: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      add: { useMutation: () => ({ mutate: addCredits, isPending: false }) },
    },
    selfImprove: {
      list: { useQuery: () => ({ data: { proposals: [] } }) },
      opportunities: { useQuery: () => ({ data: { opportunities: [{ id: "learn_1", category: "programação" }] } }) },
      createFromOpportunities: { useMutation: () => ({ mutate: createLearningProposal, isPending: false }) },
      createDirected: { useMutation: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }) },
      approve: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      reject: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    pix: {
      listPending: { useQuery: () => ({ data: { requests: pendingRecharges.requests } }) },
      approveRecharge: { useMutation: () => ({ mutate: approveRecharge, isPending: false }) },
      rejectRecharge: { useMutation: () => ({ mutate: rejectRecharge, isPending: false }) },
    },
  },
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => authState }));
vi.mock("wouter", () => ({ useLocation: () => ["/admin", vi.fn()] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

afterEach(() => {
  cleanup();
  pendingRecharges.requests = [];
  authState.user = { id: 1, role: "admin" };
  approveRecharge.mockReset();
  rejectRecharge.mockReset();
});

describe("painel administrativo de créditos", () => {
  it("renderiza o saldo do usuário e envia recargas e remoções pelo controle visível", () => {
    render(<Admin />);

    expect(screen.getByText("Créditos")).toBeVisible();
    expect(screen.getByText("17")).toBeVisible();
    expect(screen.getByText("∞ (ilimitado)")).toBeVisible();

    const quantity = screen.getByPlaceholderText("Qtd");
    fireEvent.change(quantity, { target: { value: "4" } });
    fireEvent.click(screen.getByTitle("Adicionar créditos"));
    expect(addCredits).toHaveBeenLastCalledWith({ email: "cliente@exemplo.com", amount: 4 });

    fireEvent.change(quantity, { target: { value: "3" } });
    fireEvent.click(screen.getByTitle("Remover créditos"));
    expect(addCredits).toHaveBeenLastCalledWith({ email: "cliente@exemplo.com", amount: -3 });

    fireEvent.click(screen.getByRole("button", { name: /Criar proposta de autoaprendizagem/i }));
    expect(createLearningProposal).toHaveBeenCalledTimes(1);
  });

  it("mostra o estado vazio e disponibiliza a aprovação manual apenas para solicitação pendente", () => {
    pendingRecharges.requests = [];
    const { unmount } = render(<Admin />);
    expect(screen.getByText("Nenhuma recarga aguardando conferência.")).toBeVisible();
    unmount();

    pendingRecharges.requests = [{ id: "pix_1", userEmail: "cliente@exemplo.com", amountCents: 2000, credits: 60, createdAt: 1_786_000_000_000 }];
    render(<Admin />);

    const rechargeCard = screen.getByText("pix_1").closest("article");
    expect(rechargeCard).not.toBeNull();
    expect(within(rechargeCard!).getByText("cliente@exemplo.com")).toBeVisible();
    expect(within(rechargeCard!).getByText(/60 créditos/i)).toBeVisible();
    fireEvent.click(within(rechargeCard!).getByRole("button", { name: "Aprovar" }));
    expect(approveRecharge).toHaveBeenCalledWith({ requestId: "pix_1" });
    fireEvent.click(within(rechargeCard!).getByRole("button", { name: "Rejeitar" }));
    expect(rejectRecharge).toHaveBeenCalledWith({ requestId: "pix_1" });
  });

  it("bloqueia usuário comum antes de exibir controles administrativos de aprovação", () => {
    authState.user = { id: 2, role: "user" };

    render(<Admin />);

    expect(screen.getByText("Acesso restrito a administradores.")).toBeVisible();
    expect(screen.queryByText("Propostas para sua aprovação")).toBeNull();
    expect(screen.queryByText("Recargas Pix pendentes")).toBeNull();
  });
});
