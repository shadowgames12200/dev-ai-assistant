import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, httpLink, splitLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  // Redirecionar para a página de login do Supabase em vez do login legado
  window.location.href = "/login";
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const commonConfig = {
  url: "/api/trpc",
  transformer: superjson,
  headers() {
    try {
      const raw = sessionStorage.getItem("manus-cookie");
      if (raw) {
        const prefix = `${COOKIE_NAME}=`;
        const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
        const token = pair?.trim().slice(prefix.length);
        if (token) {
          return { Authorization: `Bearer ${token}` };
        }
      }
    } catch {}
    return {};
  },
  fetch(input: any, init: any) {
    return globalThis.fetch(input, {
      ...(init ?? {}),
      credentials: "include",
    });
  },
};

const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition(op) {
        // Use httpLink (sem batching) para uploads e mensagens pesadas
        return op.path === 'upload.uploadFile' || op.path === 'chat.send';
      },
      true: httpLink(commonConfig),
      false: httpBatchLink(commonConfig),
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
