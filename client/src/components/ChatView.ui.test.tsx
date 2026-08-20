// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import ChatView from "./ChatView";

const mockData = vi.hoisted(() => ({
  messages: [] as unknown[],
  attachments: [] as unknown[],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      chat: { conversations: { messages: { fetch: vi.fn() } } },
      credits: { me: { invalidate: vi.fn() } },
    }),
    chat: {
      chat: { send: { useMutation: () => ({}) } },
      upload: { uploadFile: { useMutation: () => ({ mutateAsync: vi.fn() }) } },
      conversations: {
        messages: { useQuery: () => ({ data: mockData.messages }) },
        attachments: { useQuery: () => ({ data: mockData.attachments }) },
      },
    },
    credits: {
      me: { useQuery: () => ({ data: { balance: 0, unlimited: false }, isLoading: false }) },
    },
  },
}));

vi.mock("streamdown", () => ({ Streamdown: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

vi.mock("@/components/ui/scroll-area", async () => {
  const ReactModule = await import("react");
  return {
    ScrollArea: ReactModule.forwardRef((props: any, ref) =>
      ReactModule.createElement("div", { ...props, ref }, props.children)
    ),
  };
});

beforeAll(() => {
  HTMLElement.prototype.scrollTo = vi.fn();
});

describe("ChatView sem créditos", () => {
  it("mostra aviso, saldo e bloqueia a entrada e os botões no DOM", () => {
    render(<ChatView conversationId={1} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Créditos insuficientes");
    expect(screen.getByText("Você está sem créditos. Entre em contato com o administrador para recarregar e continuar usando o chat.")).toBeVisible();
    expect(screen.getByPlaceholderText("Pergunte sobre programação ou produtividade...")).toBeDisabled();
    expect(screen.getByText("0 créditos")).toBeVisible();
    expect(screen.getByRole("button", { name: "Recarregar créditos" })).toBeEnabled();
    screen.getAllByRole("button")
      .filter((button) => button.textContent !== "Recarregar créditos")
      .forEach((button) => expect(button).toBeDisabled());
  });
});
