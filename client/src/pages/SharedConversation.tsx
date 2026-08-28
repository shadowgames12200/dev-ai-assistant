import { Streamdown } from "streamdown";
import { useRoute } from "wouter";
import { Link2, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function SharedConversation() {
  const [, params] = useRoute("/share/:token");
  const token = params?.token ?? "";
  const { data, isLoading, error } = trpc.chat.shared.useQuery(
    { token },
    { enabled: Boolean(token), retry: false },
  );

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f] text-zinc-400">Carregando compartilhamento...</div>;
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f] p-4 text-center text-zinc-300">
        <div className="max-w-md rounded-xl border border-white/10 bg-[#15151e] p-8">
          <Link2 className="mx-auto mb-4 h-8 w-8 text-violet-400" />
          <h1 className="text-lg font-semibold">Compartilhamento indisponível</h1>
          <p className="mt-2 text-sm text-zinc-500">Este link pode ser privado, revogado ou não existir.</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0f] px-4 py-8 text-foreground">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center gap-3 border-b border-white/10 pb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/20">
            <Sparkles className="h-5 w-5 text-violet-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-zinc-500">DevAI Assistant · Conversa compartilhada</p>
            <h1 className="truncate text-lg font-semibold">{data.title}</h1>
          </div>
        </header>

        <section className="space-y-4">
          {data.messages.map((message) => (
            <article key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}>
              {message.role !== "user" && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs text-violet-300">AI</div>}
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${message.role === "user" ? "bg-violet-600 text-white" : "bg-muted text-foreground"}`}>
                {message.role === "assistant" ? <div className="chat-markdown"><Streamdown>{message.content}</Streamdown></div> : <p className="whitespace-pre-wrap">{message.content}</p>}
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
