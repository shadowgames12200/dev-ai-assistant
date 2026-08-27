import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { ShieldCheck, ShieldOff, ArrowLeft, Users, Plus, Minus, Coins, BrainCircuit, Lightbulb, Check, X, QrCode, Cpu, Trash2, UserCog } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Admin() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: usersData, isLoading } = trpc.admin.listUsers.useQuery(undefined, {
    enabled: user?.role === "admin",
  });
  
  const { data: pendingRechargesData } = trpc.pix.listPending.useQuery(undefined, {
    enabled: user?.role === "admin",
  });

  const { data: improvementsData } = trpc.improvements.list.useQuery(undefined, {
    enabled: user?.role === "admin",
  });

  const { data: abuseCasesData } = trpc.admin.abuseCases.useQuery(undefined, {
    enabled: user?.role === "admin",
  });

  const [approvalKey, setApprovalKey] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [batchAmount, setBatchAmount] = useState("50");
  const [batchRole, setBatchRole] = useState<"admin" | "user">("admin");
  const [blockReason, setBlockReason] = useState("Abuso de conta confirmado pelo administrador.");
  const listedUserIds = (usersData || []).map((u: any) => u.id);
  const allUsersSelected = listedUserIds.length > 0 && listedUserIds.every((id: number) => selectedUserIds.includes(id));

  const adjustMutation = trpc.admin.adjustCredits.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      toast.success("Créditos atualizados com sucesso.");
    },
    onError: (err: any) => toast.error("Erro ao ajustar créditos: " + err.message),
  });

  const adjustBatchMutation = trpc.admin.adjustCreditsBatch.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      setSelectedUserIds([]);
      toast.success("Créditos atualizados nas contas selecionadas.");
    },
    onError: (err: any) => toast.error("Erro ao ajustar créditos: " + err.message),
  });

  const setRolesMutation = trpc.admin.setRoles.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      setSelectedUserIds([]);
      toast.success("Papéis atualizados nas contas selecionadas.");
    },
    onError: (err: any) => toast.error("Erro ao alterar administradores: " + err.message),
  });

  const deleteUsersMutation = trpc.admin.deleteUsers.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      setSelectedUserIds([]);
      toast.success("Contas selecionadas excluídas.");
    },
    onError: (err: any) => toast.error("Erro ao excluir contas: " + err.message),
  });

  const blockUsersMutation = trpc.admin.blockUsers.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      utils.admin.abuseCases.invalidate();
      setSelectedUserIds([]);
      toast.success("Contas bloqueadas e registradas para revisão.");
    },
    onError: (err: any) => toast.error("Erro ao bloquear contas: " + err.message),
  });

  const unblockUsersMutation = trpc.admin.unblockUsers.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      utils.admin.abuseCases.invalidate();
      setSelectedUserIds([]);
      toast.success("Contas desbloqueadas.");
    },
    onError: (err: any) => toast.error("Erro ao desbloquear contas: " + err.message),
  });

  const askForConfirmation = (phrase: string) => window.prompt(`Digite exatamente ${phrase} para confirmar:`) === phrase;

  const runSingleCredits = (userId: number, amount: number) => {
    if (!approvalKey) return toast.error("Informe a senha de aprovação.");
    if (!askForConfirmation("CONFIRMAR")) return;
    adjustMutation.mutate({ userId, amount, approvalKey, confirmation: "CONFIRMAR" });
  };

  const runBatchCredits = (amount: number) => {
    if (selectedUserIds.length === 0) return toast.error("Selecione pelo menos uma conta.");
    if (!Number.isInteger(amount) || amount === 0) return toast.error("Informe uma quantidade inteira diferente de zero.");
    if (!approvalKey) return toast.error("Informe a senha de aprovação.");
    if (!askForConfirmation("CONFIRMAR")) return;
    adjustBatchMutation.mutate({ userIds: selectedUserIds, amount, approvalKey, confirmation: "CONFIRMAR" });
  };

  const runBatchRoleChange = () => {
    if (selectedUserIds.length === 0) return toast.error("Selecione pelo menos uma conta.");
    if (!approvalKey) return toast.error("Informe a senha de aprovação.");
    if (!askForConfirmation("CONFIRMAR")) return;

    const ownerSelected = (usersData || []).some((account: any) => account.isOwner && selectedUserIds.includes(account.id));
    if (ownerSelected && user?.id !== (usersData || []).find((account: any) => account.isOwner)?.id) {
      return toast.error("Somente o proprietário pode alterar o próprio cargo.");
    }
    const ownerConfirmation = ownerSelected ? askForConfirmation("CONFIRMAR PROPRIETÁRIO") : undefined;
    if (ownerSelected && !ownerConfirmation) return;

    setRolesMutation.mutate({
      userIds: selectedUserIds,
      role: batchRole,
      approvalKey,
      confirmation: "CONFIRMAR",
      ownerOverride: ownerSelected,
      ownerConfirmation: ownerSelected ? "CONFIRMAR PROPRIETÁRIO" : undefined,
    });
  };

  const runBatchDelete = () => {
    if (selectedUserIds.length === 0) return toast.error("Selecione pelo menos uma conta.");
    if (!approvalKey) return toast.error("Informe a senha de aprovação.");
    if (!window.confirm("Isto excluirá definitivamente as contas selecionadas e seus dados. Continuar?")) return;
    if (!askForConfirmation("EXCLUIR CONTAS")) return;
    deleteUsersMutation.mutate({ userIds: selectedUserIds, approvalKey, confirmation: "EXCLUIR CONTAS", ownerOverride: false });
  };

  const runBatchBlock = () => {
    if (selectedUserIds.length === 0) return toast.error("Selecione pelo menos uma conta.");
    if (!blockReason.trim()) return toast.error("Informe o motivo do bloqueio.");
    if (!approvalKey) return toast.error("Informe a senha de aprovação.");
    if (!window.confirm("O bloqueio permanente impede login e uso da conta. Continuar?")) return;
    if (!askForConfirmation("BLOQUEAR CONTAS")) return;
    blockUsersMutation.mutate({ userIds: selectedUserIds, reason: blockReason.trim(), approvalKey, confirmation: "BLOQUEAR CONTAS" });
  };

  const runBatchUnblock = () => {
    if (selectedUserIds.length === 0) return toast.error("Selecione pelo menos uma conta.");
    if (!approvalKey) return toast.error("Informe a senha de aprovação.");
    if (!askForConfirmation("DESBLOQUEAR CONTAS")) return;
    unblockUsersMutation.mutate({ userIds: selectedUserIds, note: "Revisão manual concluída pelo administrador.", approvalKey, confirmation: "DESBLOQUEAR CONTAS" });
  };

  const approveRechargeMutation = trpc.pix.approveRecharge.useMutation({
    onSuccess: () => {
      utils.pix.listPending.invalidate();
      utils.admin.listUsers.invalidate();
      toast.success("Recarga aprovada e créditos liberados.");
    },
    onError: (err) => toast.error("Não foi possível aprovar a recarga: " + err.message),
  });

  const approveImprovementMutation = trpc.improvements.approve.useMutation({
    onSuccess: () => {
      utils.improvements.list.invalidate();
      toast.success("Melhoria aprovada para execução.");
    },
    onError: (err) => toast.error("Erro ao aprovar melhoria: " + err.message),
  });

  if (!user || user.role !== "admin") return null;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-foreground">
      <header className="border-b border-white/10 px-4 py-4 flex items-center justify-between sticky top-0 bg-[#0a0a0f]/80 backdrop-blur-md z-30 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <Users className="h-5 w-5 text-violet-400 shrink-0" />
          <h1 className="text-base sm:text-lg font-semibold truncate">Painel admin</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLocation("/chat")} className="shrink-0">
          <ArrowLeft className="h-4 w-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Voltar</span>
          <span className="sm:hidden">Chat</span>
        </Button>
      </header>

      <main className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6 sm:space-y-8">
        <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-2">
            <QrCode className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold">Recargas Pix pendentes</h2>
          </div>
          <p className="mb-4 text-xs leading-relaxed text-zinc-400">Confira o Pix no banco antes de aprovar.</p>
          {(pendingRechargesData?.requests?.length ?? 0) === 0 ? (
            <p className="text-xs text-zinc-500">Nenhuma recarga aguardando conferência.</p>
          ) : (
            <div className="space-y-3">
              {pendingRechargesData?.requests.map((request: any) => (
                <article key={request.id} className="rounded-md border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-zinc-100">ID Usuário: {request.userId}</p>
                      <p className="mt-1 text-xs text-zinc-400">R$ {request.amount} · {request.credits} créditos</p>
                    </div>
                    <Button size="sm" onClick={() => approveRechargeMutation.mutate({ id: request.id })} disabled={approveRechargeMutation.isPending} className="w-full sm:w-auto">
                      <Check className="mr-1 h-4 w-4" />Aprovar
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold">Propostas de Auto-Melhoria</h2>
          </div>
          <div className="space-y-4">
            <div className="flex gap-2 mb-4">
              <Input 
                placeholder="Chave de aprovação" 
                type="password"
                value={approvalKey}
                onChange={(e) => setApprovalKey(e.target.value)}
                className="h-9 bg-[#1e1e28] border-white/10 text-sm"
              />
            </div>
            {(!improvementsData || improvementsData.length === 0) ? (
              <p className="text-xs text-zinc-500">Nenhuma proposta de melhoria pendente.</p>
            ) : (
              <div className="grid gap-4">
                {improvementsData.map((imp: any) => (
                  <article key={imp.id} className="rounded-md border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-medium text-violet-300 break-words">{imp.title}</h3>
                        <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full shrink-0 ${
                          imp.status === "approved" ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"
                        }`}>
                          {imp.status}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed">{imp.description}</p>
                      {imp.status === "pending" && (
                        <Button 
                          size="sm" 
                          onClick={() => approveImprovementMutation.mutate({ id: imp.id, approvalKey })}
                          disabled={approveImprovementMutation.isPending || !approvalKey}
                          className="w-full sm:w-auto sm:self-end"
                        >
                          <Check className="mr-1 h-4 w-4" />Aprovar Melhoria
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <div className="flex flex-col gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-violet-400" />
              <h2 className="text-sm font-semibold">Usuários Cadastrados</h2>
            </div>
            <p className="text-xs leading-relaxed text-zinc-400">
              Selecione uma ou várias contas. Toda ação administrativa exige a senha usada para aprovar auto‑melhorias e uma confirmação explícita.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                type="password"
                value={approvalKey}
                onChange={(e) => setApprovalKey(e.target.value)}
                placeholder="Senha de aprovação"
                className="h-9 bg-[#1e1e28] border-white/10 text-sm"
              />
              <Input
                type="number"
                value={batchAmount}
                onChange={(e) => setBatchAmount(e.target.value)}
                placeholder="Créditos (+/-)"
                className="h-9 bg-[#1e1e28] border-white/10 text-sm"
              />
              <Input
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="Motivo do bloqueio"
                className="h-9 bg-[#1e1e28] border-white/10 text-sm"
              />
              <select
                value={batchRole}
                onChange={(e) => setBatchRole(e.target.value as "admin" | "user")}
                className="h-9 rounded-md border border-white/10 bg-[#1e1e28] px-3 text-sm text-zinc-100"
              >
                <option value="admin">Tornar admin</option>
                <option value="user">Revogar admin</option>
              </select>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => runBatchCredits(Number(batchAmount) || 0)} disabled={adjustBatchMutation.isPending}>
                  <Coins className="mr-1 h-4 w-4" />Aplicar créditos
                </Button>
                <Button size="sm" variant="outline" onClick={runBatchRoleChange} disabled={setRolesMutation.isPending}>
                  <UserCog className="mr-1 h-4 w-4" />Aplicar papel
                </Button>
                <Button size="sm" variant="outline" onClick={runBatchBlock} disabled={blockUsersMutation.isPending}>
                  <ShieldOff className="mr-1 h-4 w-4" />Bloquear
                </Button>
                <Button size="sm" variant="outline" onClick={runBatchUnblock} disabled={unblockUsersMutation.isPending}>
                  <ShieldCheck className="mr-1 h-4 w-4" />Desbloquear
                </Button>
                <Button size="sm" variant="destructive" onClick={runBatchDelete} disabled={deleteUsersMutation.isPending}>
                  <Trash2 className="mr-1 h-4 w-4" />Excluir
                </Button>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto rounded-md border border-white/10">
            <Table>
              <TableHeader className="bg-white/[0.02]">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-zinc-400 text-xs py-3 w-10">
                    <Checkbox
                      aria-label="Selecionar todas as contas"
                      checked={allUsersSelected}
                      onCheckedChange={(checked) => setSelectedUserIds(checked === true ? listedUserIds : [])}
                    />
                  </TableHead>
                  <TableHead className="text-zinc-400 text-xs py-3">Nome</TableHead>
                  <TableHead className="text-zinc-400 text-xs py-3">Email</TableHead>
                  <TableHead className="text-zinc-400 text-xs py-3">Papel</TableHead>
                  <TableHead className="text-zinc-400 text-xs py-3">Créditos</TableHead>
                  <TableHead className="text-zinc-400 text-xs py-3 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-zinc-500 text-xs">Carregando usuários...</TableCell></TableRow>
                ) : (usersData || []).map((u: any) => (
                  <TableRow key={u.id} className="border-white/10 hover:bg-white/[0.02]">
                    <TableCell className="w-10">
                      <Checkbox
                        aria-label={`Selecionar ${u.email || u.name || u.id}`}
                        checked={selectedUserIds.includes(u.id)}
                        onCheckedChange={(checked) => setSelectedUserIds((current) => checked === true ? Array.from(new Set([...current, u.id])) : current.filter((id) => id !== u.id))}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-xs whitespace-nowrap">{u.name || "Sem nome"}</TableCell>
                    <TableCell className="text-zinc-400 text-xs min-w-[150px]">{u.email}</TableCell>
                    <TableCell>
                      <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-violet-500/20 text-violet-300" : "bg-zinc-500/20 text-zinc-400"}`}>
                        {u.isOwner ? "dono" : u.role}
                      </span>
                      {u.isOwner && <span className="ml-2 text-[10px] text-amber-300">protegido</span>}
                      {u.accountStatus === "blocked" && <span className="ml-2 text-[10px] text-red-300">bloqueada</span>}
                      {u.accountStatus === "temporarily_blocked" && <span className="ml-2 text-[10px] text-amber-300">bloqueio temporário</span>}
                    </TableCell>
                    <TableCell className="text-violet-300 font-medium text-xs">{u.isOwner || u.role === "admin" ? "Ilimitados" : u.balance}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1.5 justify-end">
                        <Button size="icon" variant="outline" className="h-7 w-7 sm:h-8 sm:w-8" onClick={() => runSingleCredits(u.id, 50)}>
                          <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                        <Button size="icon" variant="outline" className="h-7 w-7 sm:h-8 sm:w-8" onClick={() => runSingleCredits(u.id, -50)}>
                          <Minus className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-2">
            <ShieldOff className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold">Casos de abuso e revisão</h2>
          </div>
          <p className="mb-4 text-xs leading-relaxed text-zinc-400">Bloqueios automáticos ficam temporários e aparecem aqui para análise. O bloqueio permanente só ocorre mediante ação administrativa confirmada.</p>
          {(abuseCasesData?.length ?? 0) === 0 ? (
            <p className="text-xs text-zinc-500">Nenhum caso registrado.</p>
          ) : (
            <div className="space-y-2">
              {(abuseCasesData || []).map((abuseCase: any) => (
                <article key={abuseCase.id} className="rounded-md border border-white/10 bg-black/20 p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-zinc-100">{abuseCase.userName || abuseCase.userEmail || `Usuário ${abuseCase.userId}`}</span>
                    <span className="text-zinc-500">Caso #{abuseCase.id} · {abuseCase.status}</span>
                  </div>
                  <p className="mt-1 text-zinc-400">Pontuação: {abuseCase.score} · Conta: {abuseCase.accountStatus || "desconhecida"}</p>
                  {abuseCase.reviewNote && <p className="mt-1 text-zinc-500">Nota: {abuseCase.reviewNote}</p>}
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
