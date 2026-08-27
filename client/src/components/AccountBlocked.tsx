import { ShieldOff } from "lucide-react";
import type { SupportLinks } from "@/lib/support";

export type BlockStatusView = {
  blocked: boolean;
  permanent: boolean;
  message: string | null;
  blockedUntil: string | null;
  support: SupportLinks | null;
};

export default function AccountBlocked({ status }: { status: BlockStatusView }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0a0f] p-4 text-foreground">
      <section className="w-full max-w-lg space-y-5 rounded-2xl border border-amber-500/25 bg-[#14141c] p-7 shadow-2xl sm:p-8" role="alert">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15">
            <ShieldOff className="h-6 w-6 text-amber-300" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Acesso temporariamente limitado</h1>
            <p className="text-sm text-zinc-400">A DevAI protege as contas e os créditos dos usuários.</p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-zinc-200">{status.message || "Sua conta está bloqueada. Solicite uma revisão pelo suporte."}</p>
        {status.blockedUntil && !status.permanent && <p className="text-xs text-zinc-400">O bloqueio temporário está previsto até {new Date(status.blockedUntil).toLocaleString("pt-BR")}.</p>}
        <p className="text-sm leading-relaxed text-zinc-400">Se isso for um engano, use um dos canais abaixo e informe apenas o protocolo que o suporte solicitar. Nunca envie sua senha, token ou chave de aprovação.</p>
        <div className="flex flex-wrap gap-2">
          {status.support?.whatsappUrl && <a className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-500" href={status.support.whatsappUrl} target="_blank" rel="noreferrer">WhatsApp</a>}
          {status.support?.discordUrl && <a className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500" href={status.support.discordUrl} target="_blank" rel="noreferrer">Discord</a>}
          {status.support?.email && <a className="rounded-md bg-zinc-700 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-600" href={`mailto:${status.support.email}`}>E-mail</a>}
          {!status.support?.whatsappUrl && !status.support?.discordUrl && !status.support?.email && <span className="text-xs text-zinc-500">Os canais de suporte ainda não foram configurados.</span>}
        </div>
      </section>
    </main>
  );
}
