// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { authState } = vi.hoisted(() => ({
  authState: { user: null as any, loading: false },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/pages/Login", () => ({
  default: () => <div>Página de acesso local</div>,
}));

vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));

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
});
