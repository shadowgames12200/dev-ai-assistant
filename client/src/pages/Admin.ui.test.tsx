// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Admin from "./Admin";

const { authState } = vi.hoisted(() => ({
  authState: { user: { id: 1, role: "admin" } as { id: number; role: "admin" | "user" } },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      admin: { listUsers: { invalidate: vi.fn() }, abuseCases: { invalidate: vi.fn() } },
      pix: { listPending: { invalidate: vi.fn() } },
      improvements: { list: { invalidate: vi.fn() } },
    }),
    admin: {
      listUsers: { useQuery: () => ({ data: [
        { id: 1, email: "dono@exemplo.com", name: "Dono", role: "admin", balance: 0, isOwner: true },
        { id: 2, email: "cliente@exemplo.com", name: "Cliente", role: "user", balance: 20, isOwner: false },
      ], isLoading: false }) },
      abuseCases: { useQuery: () => ({ data: [] }) },
      adjustCredits: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      adjustCreditsBatch: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      setRoles: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      deleteUsers: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      blockUsers: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      unblockUsers: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    pix: {
      listPending: { useQuery: () => ({ data: { requests: [] } }) },
      approveRecharge: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    improvements: {
      list: { useQuery: () => ({ data: [] }) },
      approve: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => authState }));
vi.mock("wouter", () => ({ useLocation: () => ["/admin", vi.fn()] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

afterEach(() => {
  cleanup();
  authState.user = { id: 1, role: "admin" };
});

describe("visibilidade do painel administrativo", () => {
  it("exibe o painel e seus controles para administrador", () => {
    render(<Admin />);

    expect(screen.getByText("Painel admin")).toBeVisible();
    expect(screen.getByText("Usuários Cadastrados")).toBeVisible();
    expect(screen.getByText("dono@exemplo.com")).toBeVisible();
    expect(screen.getByText("cliente@exemplo.com")).toBeVisible();
    expect(screen.getByPlaceholderText("Senha de aprovação")).toBeVisible();
  });

  it("não renderiza conteúdo administrativo para usuário comum", () => {
    authState.user = { id: 2, role: "user" };

    render(<Admin />);

    expect(screen.queryByText("Painel admin")).toBeNull();
    expect(screen.queryByText("Usuários Cadastrados")).toBeNull();
    expect(screen.queryByText("Recargas Pix pendentes")).toBeNull();
    expect(screen.queryByPlaceholderText("Senha de aprovação")).toBeNull();
  });
});
