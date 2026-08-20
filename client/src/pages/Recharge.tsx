import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useLocation } from "wouter";
import { ArrowLeft, CheckCircle2, Clipboard, Coins, Loader2, MessageCircle, QrCode, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type PixPackageView = {
  id: string;
  label: string;
  amountCents: number;
  amount: string;
  credits: number;
  brCode: string;
};

function requestStatusLabel(status: string) {
  if (status === "approved") return "Créditos liberados";
  if (status === "rejected") return "Solicitação rejeitada";
  return "Aguardando confirmação manual";
}

export default function Recharge() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.pix.packages.useQuery();
  const { data: requestsData } = trpc.pix.myRequests.useQuery();
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  const packages = (data?.packages ?? []) as PixPackageView[];
  useEffect(() => {
    if (!selectedPackageId && packages[0]) setSelectedPackageId(packages[0].id);
  }, [packages, selectedPackageId]);

  const selectedPackage = useMemo(
    () => packages.find((item) => item.id === selectedPackageId) ?? packages[0],
    [packages, selectedPackageId]
  );

  useEffect(() => {
    let active = true;
    if (!selectedPackage?.brCode) {
      setQrCodeUrl("");
      return;
    }
    QRCode.toDataURL(selectedPackage.brCode, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#111827", light: "#ffffff" },
    }).then((url) => {
      if (active) setQrCodeUrl(url);
    }).catch(() => {
      if (active) setQrCodeUrl("");
    });
    return () => { active = false; };
  }, [selectedPackage?.brCode]);

  const requestMutation = trpc.pix.requestRecharge.useMutation({
    onSuccess: (result) => {
      utils.pix.myRequests.invalidate();
      toast.success(result.ownerNotified
        ? "Solicitação registrada. O proprietário foi alertado para conferir o pagamento."
        : "Solicitação registrada. Aguarde a conferência manual do pagamento.");
    },
    onError: (mutationError) => toast.error(mutationError.message || "Não foi possível registrar a solicitação."),
  });

  const copyPix = async () => {
    if (!selectedPackage?.brCode) return;
    try {
      await navigator.clipboard.writeText(selectedPackage.brCode);
      toast.success("Pix Copia e Cola copiado.");
    } catch {
      toast.error("Não foi possível copiar automaticamente. Selecione o código e copie manualmente.");
    }
  };

  if (isLoading) {
    return <main className="min-h-screen bg-[#0a0a0f] p-6 text-zinc-200"><p className="mx-auto max-w-4xl text-sm text-zinc-400">Carregando opções de recarga...</p></main>;
  }
  if (error || !selectedPackage) {
    return <main className="min-h-screen bg-[#0a0a0f] p-6 text-zinc-200"><div className="mx-auto max-w-4xl rounded-lg border border-red-400/30 bg-red-400/10 p-4"><p className="text-sm">Não foi possível carregar as opções de recarga agora.</p><Button className="mt-3" variant="outline" onClick={() => setLocation("/chat")}>Voltar ao chat</Button></div></main>;
  }

  const pendingForSelected = (requestsData?.requests ?? []).find((request: any) => request.status === "pending" && request.packageId === selectedPackage.id);
  const whatsappUrl = `https://wa.me/${data?.supportWhatsAppNumber}?text=${encodeURIComponent("Olá, preciso de ajuda com uma recarga de créditos da DevAI.")}`;

  return (
    <main className="min-h-screen bg-[#0a0a0f] px-4 py-6 text-zinc-100 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-7 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-300">Créditos DevAI</p>
            <h1 className="mt-1 text-2xl font-semibold">Recarregar com Pix</h1>
          </div>
          <Button variant="outline" onClick={() => setLocation("/chat")}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao chat</Button>
        </header>

        <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
          <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" /><div><strong>Liberação manual por segurança.</strong><p className="mt-1 text-xs leading-relaxed text-amber-100/85">O QR Code e o Pix Copia e Cola não liberam créditos automaticamente. Após pagar, registre a solicitação abaixo; o proprietário confere o pagamento e aprova ou rejeita manualmente.</p></div></div>
        </div>

        <section aria-label="Pacotes de créditos" className="grid gap-3 md:grid-cols-3">
          {packages.map((pkg) => {
            const selected = pkg.id === selectedPackage.id;
            return <button key={pkg.id} type="button" onClick={() => setSelectedPackageId(pkg.id)} className={`rounded-xl border p-5 text-left transition-colors ${selected ? "border-violet-400 bg-violet-500/15" : "border-white/10 bg-white/[0.03] hover:border-violet-300/50"}`}>
              <span className="text-xs text-zinc-400">{pkg.label}</span>
              <strong className="mt-2 block text-2xl text-white">R$ {pkg.amount.replace(".", ",")}</strong>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-violet-200"><Coins className="h-4 w-4" />{pkg.credits} créditos</span>
            </button>;
          })}
        </section>

        <section className="mt-6 grid gap-6 rounded-xl border border-white/10 bg-white/[0.03] p-5 lg:grid-cols-[320px_1fr]">
          <div className="flex flex-col items-center rounded-lg bg-white p-3">
            {qrCodeUrl ? <img src={qrCodeUrl} alt={`QR Code Pix de R$ ${selectedPackage.amount.replace(".", ",")}`} className="h-[280px] w-[280px] max-w-full" /> : <div className="flex h-[280px] w-[280px] items-center justify-center text-sm text-zinc-600"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Gerando QR Code</div>}
            <p className="mt-2 text-center text-xs text-zinc-600"><QrCode className="mr-1 inline h-3 w-3" />Use o aplicativo do seu banco para escanear</p>
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{selectedPackage.credits} créditos por R$ {selectedPackage.amount.replace(".", ",")}</h2>
            <p className="mt-1 text-sm text-zinc-400">Recebedor: {data?.receiverName} · {data?.city}</p>
            <label className="mt-5 block text-xs font-medium text-zinc-300" htmlFor="pix-copy-paste">Pix Copia e Cola</label>
            <textarea id="pix-copy-paste" readOnly value={selectedPackage.brCode} className="mt-2 h-28 w-full resize-none rounded-md border border-white/10 bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-zinc-300" />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" onClick={copyPix}><Clipboard className="mr-2 h-4 w-4" />Copiar código Pix</Button>
              <Button variant="outline" asChild><a href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle className="mr-2 h-4 w-4" />Suporte no WhatsApp</a></Button>
            </div>
            <div className="mt-6 rounded-lg border border-white/10 bg-black/20 p-4">
              <h3 className="font-medium">Depois de fazer o pagamento</h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">Clique em “Já paguei” apenas após concluir o Pix. Isso envia uma solicitação para conferência; não substitui a confirmação do pagamento no banco.</p>
              {pendingForSelected ? <p className="mt-3 flex items-center gap-2 text-sm text-amber-200"><Loader2 className="h-4 w-4 animate-spin" />Sua solicitação está aguardando a confirmação manual.</p> : <Button className="mt-4 bg-violet-600 hover:bg-violet-500" onClick={() => requestMutation.mutate({ packageId: selectedPackage.id })} disabled={requestMutation.isPending}>{requestMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Já paguei — solicitar conferência</Button>}
            </div>
          </div>
        </section>

        {(requestsData?.requests?.length ?? 0) > 0 && <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-sm font-semibold">Minhas solicitações</h2><div className="mt-3 space-y-2">{requestsData?.requests.slice(0, 5).map((request: any) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-black/20 px-3 py-2 text-xs"><span>R$ {(request.amountCents / 100).toFixed(2).replace(".", ",")} · {request.credits} créditos</span><span className={request.status === "approved" ? "text-emerald-300" : request.status === "rejected" ? "text-red-300" : "text-amber-200"}>{requestStatusLabel(request.status)}</span></div>)}</div></section>}
      </div>
    </main>
  );
}
