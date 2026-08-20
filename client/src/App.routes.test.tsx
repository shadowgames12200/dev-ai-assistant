// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false }),
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
});

describe("rotas de acesso", () => {
  it("exibe a tela de acesso também em /login para suportar links e redirecionamentos antigos", () => {
    window.history.pushState({}, "", "/login");

    render(<App />);

    expect(screen.getByText("Página de acesso local")).not.toBeNull();
  });
});
