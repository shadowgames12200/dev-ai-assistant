// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Chat from "./Chat";

const deleteConversation = vi.fn();
const logout = vi.fn();
let deleteOptions: { onSuccess?: (data: unknown, variables: { id: number }) => void } | undefined;
const conversationsFixture = [
  { id: 7, title: "Planejamento", updatedAt: new Date("2026-08-20T12:00:00.000Z") },
  { id: 8, title: "Relatório", updatedAt: new Date("2026-08-20T12:01:00.000Z") },
];

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ chat: { conversations: { list: { invalidate: vi.fn() } } } }),
    chat: {
      conversations: {
        list: {
          useQuery: () => ({
            data: conversationsFixture,
          }),
        },
        create: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        delete: {
          useMutation: (options: typeof deleteOptions) => {
            deleteOptions = options;
            return {
              mutate: (variables: { id: number }) => {
                deleteConversation(variables);
                options?.onSuccess?.({}, variables);
              },
              isPending: false,
            };
          },
        },
        rename: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        clear: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      },
    },
    credits: { me: { useQuery: () => ({ data: { balance: 50, isAdmin: false } }) } },
  },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, name: "Cliente", email: "cliente@exemplo.com", role: "user" }, logout }),
}));
vi.mock("@/components/ChatView", () => ({
  default: ({ conversationId }: { conversationId: number }) => <div>Conversa aberta {conversationId}</div>,
}));
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLDivElement>;
  }) => <div onClick={onClick}>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button role="menuitem" onClick={onClick}>{children}</button>
  ),
}));
vi.mock("wouter", () => ({ useLocation: () => ["/chat", vi.fn()] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("ações de conversa na barra lateral", () => {
  it("aciona a exclusão pelo menu de três pontos sem trocar a conversa ativa", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Chat />);

    expect(screen.getByText("Conversa aberta 7")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Mais ações para Relatório" }));
    expect(screen.getByText("Conversa aberta 7")).toBeVisible();
    fireEvent.click(screen.getAllByRole("menuitem", { name: "Excluir conversa" })[1]);

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(deleteConversation).toHaveBeenCalledWith({ id: 8 });
    expect(screen.queryByText("Relatório")).not.toBeInTheDocument();
    expect(screen.getByText("Conversa aberta 7")).toBeVisible();
  });

  it("abre o menu da conta e permite sair sem depender do menu de conversas", () => {
    render(<Chat />);

    fireEvent.click(screen.getByLabelText("Abrir menu da conta"));
    expect(screen.getByTestId("account-menu")).toHaveAttribute("open");
    expect(screen.getByRole("menu", { name: "Menu da conta" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Conta" })).toBeVisible();

    fireEvent.click(screen.getByRole("menuitem", { name: "Sair" }));
    expect(logout).toHaveBeenCalledOnce();
  });
});
