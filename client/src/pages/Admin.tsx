import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { ShieldCheck, ShieldOff, ArrowLeft, Users, Plus, Minus, Coins, BrainCircuit, Lightbulb, Check, X, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { parseCreditAdjustment } from "@/lib/credits";

export default function Admin() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: usersData, isLoading } = trpc.admin.listUsers.useQuery(undefined, {
    enabled: user?.role === "admin",
  });
  const { data: creditsList } = trpc.credits.list.useQuery(undefined, {
    enabled: user?.role === "admin",
  });
  const creditsByUser = new Map(
    ((creditsList as any[]) || []).map((c: any) => [Number(c.id), Number(c.balance ?? 0)])
  );
  const { data: proposalsData } = trpc.selfImprove.list.useQuery(undefined, {
    enabled: user?.role === "admin",
  });
  const { data: opportunitiesData } = trpc.selfImprove.opportunities.useQuery(undefined, {
    enabled: user?.role === "admin",
  });
  const { data: pendingRechargesData } = trpc.pix.listPending.useQuery(undefined, {
    enabled: user?.role === "admin",
  });
  const [approvalKey, setApprovalKey] = useState("");

  // ---- Gestão de créditos (admin) ----
  const { data: costData } = trpc.credits.getCost.useQuery(undefined, {
    enabled: user?.role === "admin",
  });
  const [costInput, setCostInput] = useState("");

  const setCostMutation = trpc.credits.setCost.useMutation({
    onSuccess: () => {
      utils.credits.getCost.invalidate();
      toast.success("Custo por mensagem atualizado.");
    },
    onError: (err: any) => toast.error("Erro ao atualizar custo: " + err.message),
  });

  const adjustMutation = trpc.credits.add.useMutation({
    onSuccess: () => {
      utils.credits.list.invalidate();
      toast.success("Créditos atualizados com sucesso.");
    },
    onError: (err: any) => toast.error("Erro ao ajustar créditos: " + err.message),
  });

  const setRoleMutation = trpc.admin.setUserRole.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      toast.success("Papel atualizado.");
    },
    onError: (err) => {
      if ((err as any)?.shape?.code === "FORBIDDEN") {
        toast.error("Apenas administradores podem alterar papéis.");
      } else {
        toast.error("Erro ao atualizar papel: " + err.message);
      }
    },
  });
  const createLearningProposalMutation = trpc.selfImprove.createFromOpportunities.useMutation({
    onSuccess: (result) => {
      utils.selfImprove.list.invalidate();
      utils.selfImprove.opportunities.invalidate();
      result.success ? toast.success(result.message) : toast.info(result.message);
    },
    onError: (err) => toast.error("Não foi possível criar a proposta: " + err.message),
  });

  // Auto-melhoria direcionada pelo proprietário
  const [directedTopic, setDirectedTopic] = useState("");
  const [directedReason, setDirectedReason] = useState("");
  const createDirectedMutation = trpc.selfImprove.createDirected.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        setDirectedTopic("");
        setDirectedReason("");
        utils.selfImprove.list.invalidate();
        toast.success(result.message);
      } else {
        toast.info(result.message);
      }
    },
    onError: (err) => toast.error("Não foi possível criar a proposta: " + err.message),
  });
  const approveProposalMutation = trpc.selfImprove.approve.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        setApprovalKey("");
        utils.selfImprove.list.invalidate();
        toast.success("Proposta aprovada. Nenhuma alteração é aplicada automaticamente.");
      } else {
        toast.error(result.message);
      }
    },
    onError: (err) => toast.error("Não foi possível aprovar: " + err.message),
  });
  const rejectProposalMutation = trpc.selfImprove.reject.useMutation({
    onSuccess: () => {
      utils.selfImprove.list.invalidate();
      toast.success("Proposta rejeitada. Nenhuma mudança foi realizada.");
    },
    onError: (err) => toast.error("Não foi possível rejeitar: " + err.message),
  });
  const approveRechargeMutation = trpc.pix.approveRecharge.useMutation({
    onSuccess: (result) => {
      utils.pix.listPending.invalidate();
      utils.credits.list.invalidate();
      toast.success(result.creditsAdded ? "Recarga aprovada e créditos liberados." : "Recarga já havia sido aplicada; nenhum crédito foi duplicado.");
    },
    onError: (err) => toast.error("Não foi possível aprovar a recarga: " + err.message),
  });
  const rejectRechargeMutation = trpc.pix.rejectRecharge.useMutation({
    onSuccess: () => {
      utils.pix.listPending.invalidate();
      toast.success("Solicitação de recarga rejeitada.");
    },
    onError: (err) => toast.error("Não foi possível rejeitar a recarga: " + err.message),
  });

  if (user && user.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-[#0a0a0f] text-foreground">
        <p className="text-sm text-zinc-400">Acesso restrito a administradores.</p>
        <Button variant="outline" onClick={() => setLocation("/chat")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar ao chat
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-foreground">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-violet-400" />
          <h1 className="text-lg font-semibold">Painel de administração</h1>
        </div>
        <Button variant="outline" onClick={() => setLocation("/chat")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar ao chat
        </Button>
      </header>

      <main className="p-6 max-w-4xl mx-auto">
        <p className="text-sm text-zinc-400 mb-4">
          Gerencie os usuários cadastrados, os créditos, o custo por mensagem e as propostas pendentes de autoaprendizagem.
        </p>

        {/* ---- Custo por mensagem ---- */}
        <section className="mb-8 rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Coins className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold">Custo por mensagem</h2>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            Quantos créditos cada mensagem consome (0 = grátis para todos). Para o
            administrador o consumo é sempre zero.
          </p>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={0}
              max={100}
              placeholder={String(costData?.costPerMessage ?? 1)}
              value={costInput}
              onChange={(e) => setCostInput(e.target.value)}
              className="max-w-24 bg-[#0a0a0f]"
            />
            <Button
              size="sm"
              onClick={() => {
                const v = parseInt(costInput, 10);
                if (isNaN(v) || v < 0 || v > 100) {
                  toast.error("Informe um valor entre 0 e 100.");
                  return;
                }
                setCostMutation.mutate({ costPerMessage: v });
                setCostInput("");
              }}
              disabled={setCostMutation.isPending}
            >
              Definir
            </Button>
            <span className="text-xs text-zinc-400">
              Valor atual:{" "}
              <strong className="text-violet-300">{costData?.costPerMessage ?? 1} crédito(s)</strong>
            </span>
          </div>
        </section>

        <section className="mb-8 rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-2 mb-2">
            <QrCode className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold">Recargas Pix pendentes</h2>
          </div>
          <p className="mb-4 text-xs leading-relaxed text-zinc-400">A solicitação não comprova pagamento. Confira o Pix no banco antes de aprovar; a aprovação libera os créditos somente uma vez.</p>
          {(pendingRechargesData?.requests?.length ?? 0) === 0 ? <p className="text-xs text-zinc-500">Nenhuma recarga aguardando conferência.</p> : <div className="space-y-3">{pendingRechargesData?.requests.map((request: any) => <article key={request.id} className="rounded-md border border-white/10 bg-black/20 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-zinc-100">{request.userEmail || "Usuário sem e-mail"}</p><p className="mt-1 text-xs text-zinc-400">R$ {(request.amountCents / 100).toFixed(2).replace(".", ",")} · {request.credits} créditos · {new Date(request.createdAt).toLocaleString("pt-BR")}</p><p className="mt-1 font-mono text-[10px] text-zinc-500">{request.id}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" className="border-red-400/30 text-red-200" onClick={() => rejectRechargeMutation.mutate({ requestId: request.id })} disabled={rejectRechargeMutation.isPending}><X className="mr-1 h-4 w-4" />Rejeitar</Button><Button size="sm" onClick={() => approveRechargeMutation.mutate({ requestId: request.id })} disabled={approveRechargeMutation.isPending}><Check className="mr-1 h-4 w-4" />Aprovar</Button></div></div></article>)}</div>}
        </section>

        <section className="mb-8 rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <BrainCircuit className="h-4 w-4 text-violet-400" />
                <h2 className="text-sm font-semibold">Autoaprendizagem sob aprovação</h2>
              </div>
              <p className="max-w-2xl text-xs leading-relaxed text-zinc-400">
                A fila usa somente temas genéricos identificados nas conversas; não guarda textos, anexos, usuários ou segredos. Criar uma proposta não pesquisa, não aprende permanentemente e não muda o código.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => createLearningProposalMutation.mutate()}
              disabled={createLearningProposalMutation.isPending || !((opportunitiesData?.opportunities as any[])?.length)}
            >
              <Lightbulb className="h-4 w-4 mr-1" />
              Criar proposta de autoaprendizagem
            </Button>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Oportunidades seguras pendentes: <strong className="text-violet-300">{(opportunitiesData?.opportunities as any[])?.length ?? 0}</strong>
          </p>
          {!((opportunitiesData?.opportunities as any[])?.length) && (
            <p className="mt-2 text-xs text-zinc-500">Ainda não há temas seguros pendentes. A IA continuará apenas registrando categorias genéricas relevantes.</p>
          )}
        </section>

        {/* ---- Auto-melhoria direcionada pelo proprietário ---- */}
        <section className="mb-8 rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-2 mb-3">
            <BrainCircuit className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-semibold">Solicitar aprendizado específico</h2>
          </div>
          <p className="mb-3 text-xs leading-relaxed text-zinc-400">
            Escolha um tema que você quer que a IA estude. Ao enviar, uma proposta é criada no painel abaixo para sua aprovação. Nenhuma pesquisa ou mudança acontece sem sua aprovação.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              type="text"
              placeholder="Tema (ex: formatação ABNT, planilhas Excel avançado, etc.)"
              value={directedTopic}
              onChange={(event) => setDirectedTopic(event.target.value)}
              className="max-w-md bg-[#0a0a0f]"
              maxLength={500}
            />
            <Button
              size="sm"
              onClick={() => createDirectedMutation.mutate({ topic: directedTopic.trim(), reason: directedReason.trim() || undefined })}
              disabled={createDirectedMutation.isPending || directedTopic.trim().length < 3}
            >
              Solicitar aprendizado
            </Button>
          </div>
          <Input
            type="text"
            placeholder="Motivo (opcional)"
            value={directedReason}
            onChange={(event) => setDirectedReason(event.target.value)}
            className="mt-2 max-w-md bg-[#0a0a0f]"
            maxLength={1000}
          />
          {createDirectedMutation.isSuccess && (
            <p className="mt-2 text-xs text-emerald-300">Proposta criada com sucesso. Revise e aprove no painel abaixo.</p>
          )}
        </section>

        <section className="mb-8 rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-amber-300" />
            <h2 className="text-sm font-semibold">Propostas para sua aprovação</h2>
          </div>
          <p className="mb-4 text-xs leading-relaxed text-zinc-400">
            Aprove somente se os benefícios, riscos e impacto fizerem sentido. Aprovar registra sua decisão, mas não pesquisa fontes, não mexe em dados e não altera código automaticamente.
          </p>
          <Input
            type="password"
            autoComplete="off"
            placeholder="Chave de aprovação do proprietário"
            value={approvalKey}
            onChange={(event) => setApprovalKey(event.target.value)}
            className="mb-4 max-w-md bg-[#0a0a0f]"
          />
          <div className="space-y-3">
            {(proposalsData?.proposals || []).map((proposal: any) => (
              <article key={proposal.id} className="rounded-md border border-white/10 bg-black/20 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-zinc-100">{proposal.title}</h3>
                    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] ${proposal.status === "pending" ? "bg-amber-500/15 text-amber-200" : proposal.status === "approved" ? "bg-emerald-500/15 text-emerald-200" : "bg-zinc-500/15 text-zinc-300"}`}>
                      {proposal.status === "pending" ? "Aguardando decisão" : proposal.status === "approved" ? "Aprovada" : "Rejeitada"}
                    </span>
                  </div>
                  {proposal.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="border-red-400/30 text-red-200" onClick={() => rejectProposalMutation.mutate({ proposalId: proposal.id })} disabled={rejectProposalMutation.isPending}>
                        <X className="mr-1 h-4 w-4" /> Rejeitar
                      </Button>
                      <Button size="sm" onClick={() => approveProposalMutation.mutate({ proposalId: proposal.id, approvalKey })} disabled={approveProposalMutation.isPending || !approvalKey.trim()}>
                        <Check className="mr-1 h-4 w-4" /> Aprovar
                      </Button>
                    </div>
                  )}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-zinc-300">{proposal.description}</p>
                <ProposalDetails label="Benefícios" values={proposal.benefits} />
                <ProposalDetails label="Riscos" values={proposal.risks} />
                {proposal.researchPlan && <p className="mt-2 text-xs text-zinc-400"><strong className="text-zinc-200">Pesquisa após aprovação:</strong> {proposal.researchPlan}</p>}
                {proposal.impact && <p className="mt-2 text-xs text-zinc-400"><strong className="text-zinc-200">Impacto:</strong> {proposal.impact}</p>}
                {proposal.reversal && <p className="mt-2 text-xs text-zinc-400"><strong className="text-zinc-200">Como desfazer:</strong> {proposal.reversal}</p>}
              </article>
            ))}
            {(!proposalsData?.proposals || proposalsData.proposals.length === 0) && <p className="text-xs text-zinc-500">Nenhuma proposta criada ainda.</p>}
          </div>
        </section>

        {/* ---- Usuários e créditos ---- */}
        <section>
          {isLoading ? (
            <p className="text-sm text-zinc-500">Carregando...</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-white/10">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow className="border-white/10">
                  <TableHead className="text-zinc-300">E-mail</TableHead>
                  <TableHead className="text-zinc-300">Nome</TableHead>
                  <TableHead className="text-zinc-300">Método de login</TableHead>
                  <TableHead className="text-zinc-300">Créditos</TableHead>
                  <TableHead className="text-zinc-300">Papel</TableHead>
                  <TableHead className="text-zinc-300">Último acesso</TableHead>
                  <TableHead className="text-zinc-300 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(usersData as any[])?.map((u: any) => (
                  <TableRow key={u.id} className="border-white/10">
                    <TableCell className="font-mono text-xs">{u.email}</TableCell>
                    <TableCell>{u.name || "-"}</TableCell>
                    <TableCell className="text-zinc-400">{u.loginMethod || "-"}</TableCell>
                    <TableCell className="text-violet-300 font-medium text-xs">
                      {u.role === "admin"
                        ? "∞ (ilimitado)"
                        : `${creditsByUser.get(u.id) ?? 0}`}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          u.role === "admin"
                            ? "bg-violet-500/20 text-violet-300"
                            : "bg-white/10 text-zinc-300"
                        }`}
                      >
                        {u.role}
                      </span>
                    </TableCell>
                    <TableCell className="text-zinc-400 text-xs">
                      {u.lastSignedIn
                        ? new Date(u.lastSignedIn).toLocaleString("pt-BR")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {u.role === "user" && (
                          <CreditButtons
                            email={u.email}
                            disabled={adjustMutation.isPending}
                            onAdjust={(email, amount) => adjustMutation.mutate({ email, amount })}
                          />
                        )}
                        {u.role === "user" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-violet-300 hover:text-violet-200"
                            onClick={() => setRoleMutation.mutate({ id: u.id, role: "admin" })}
                          >
                            <ShieldCheck className="h-4 w-4 mr-1" />
                            Tornar admin
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-zinc-400 hover:text-zinc-200"
                            onClick={() =>
                              setRoleMutation.mutate({ id: u.id, role: "user" })
                            }
                            disabled={u.id === user?.id}
                          >
                            <ShieldOff className="h-4 w-4 mr-1" />
                            Remover admin
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(!usersData || (usersData as any[]).length === 0) && (
                  <TableRow className="border-white/10">
                    <TableCell colSpan={7} className="text-center text-zinc-500 py-8">
                      Nenhum usuário cadastrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function ProposalDetails({ label, values }: { label: string; values?: unknown }) {
  const items = Array.isArray(values) ? values.filter((value) => typeof value === "string" && value.trim()) : [];
  if (items.length === 0) return null;
  return <p className="mt-2 text-xs text-zinc-400"><strong className="text-zinc-200">{label}:</strong> {items.join("; ")}</p>;
}

function CreditButtons({
  email,
  disabled,
  onAdjust,
}: {
  email: string;
  disabled: boolean;
  onAdjust: (email: string, amount: number) => void;
}) {
  const [amount, setAmount] = useState("");
  const handle = (sign: 1 | -1) => {
    const adjustment = parseCreditAdjustment(amount, sign);
    if (adjustment === null) {
      toast.error("Informe uma quantidade válida.");
      return;
    }
    onAdjust(email, adjustment);
    setAmount("");
  };
  return (
    <div className="flex items-center gap-1 mr-2">
      <Input
        type="number"
        min={1}
        placeholder="Qtd"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="h-8 w-16 bg-[#0a0a0f] text-xs"
      />
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-emerald-300 hover:text-emerald-200"
        onClick={() => handle(1)}
        disabled={disabled}
        title="Adicionar créditos"
      >
        <Plus className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-red-300 hover:text-red-200"
        onClick={() => handle(-1)}
        disabled={disabled}
        title="Remover créditos"
      >
        <Minus className="h-4 w-4" />
      </Button>
    </div>
  );
}
