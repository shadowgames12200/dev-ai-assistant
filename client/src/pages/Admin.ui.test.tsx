// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Admin from "./Admin";

const addCredits = vi.fn();
const createLearningProposal = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      credits: { list: { invalidate: vi.fn() }, getCost: { invalidate: vi.fn() } },
      admin: { listUsers: { invalidate: vi.fn() } },
      selfImprove: { list: { invalidate: vi.fn() }, opportunities: { invalidate: vi.fn() } },
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
      approve: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      reject: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1, role: "admin" } }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/admin", vi.fn()] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

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
});
