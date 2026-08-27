// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const { authState, blockStatusState } = vi.hoisted(() => ({
  authState: { user: null as any, loading: false },
  blockStatusState: { data: { blocked: false } as any, isLoading: false },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/pages/Login", () => ({
  default: () => <div>Página de acesso local</div>,
}));

vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      blockStatus: { useQuery: () => blockStatusState },
    },
  },
}));

vi.mock("@/pages/Chat", () => ({ default: () => <div>Chat</div> }));
vi.mock("@/pages/Admin", () => ({ default: () => <div>Admin</div> }));
vi.mock("@/pages/Account", () => ({ default: () => <div>Conta</div> }));
vi.mock("@/pages/Recharge", () => ({ default: () => <div>Recarga</div> }));

import App from "./App";

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
  authState.user = null;
  authState.loading = false;
  blockStatusState.data = { blocked: false };
  blockStatusState.isLoading = false;
});

describe("rotas de acesso", () => {
  it("exibe a tela de acesso também em /login para suportar links e redirecionamentos antigos", () => {
    window.history.pushState({}, "", "/login");

    render(<App />);

    expect(screen.getByText("Página de acesso local")).not.toBeNull();
  });

  it("leva um administrador autenticado à área existente de aprovações em /approvals", () => {
    authState.user = { id: 1, role: "admin" };
    window.history.pushState({}, "", "/approvals");

    render(<App />);

    expect(screen.getByText("Admin")).not.toBeNull();
  });

  it("redireciona usuário comum que tenta abrir /admin sem renderizar o painel", async () => {
    authState.user = { id: 2, role: "user" };
    window.history.pushState({}, "", "/admin");

    render(<App />);

    await waitFor(() => expect(screen.getByText("Chat")).not.toBeNull());
    expect(screen.queryByText("Admin")).toBeNull();
  });

  it("mantém uma sessão bloqueada na tela de bloqueio em vez de redirecionar para o chat", () => {
    authState.user = { id: 3, role: "user" };
    blockStatusState.data = {
      blocked: true,
      permanent: false,
      message: "Conta bloqueada para revisão.",
      blockedUntil: null,
      support: null,
    };
    window.history.pushState({}, "", "/login");

    render(<App />);

    expect(screen.getByRole("alert")).not.toBeNull();
    expect(screen.getByText("Conta bloqueada para revisão.")).not.toBeNull();
    expect(screen.queryByText("Página de acesso local")).toBeNull();
  });
});
