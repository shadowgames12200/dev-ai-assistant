import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { ShieldCheck, ShieldOff, ArrowLeft, Users, Plus, Minus, Coins, BrainCircuit, Lightbulb, Check, X, QrCode, Cpu } from "lucide-react";
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

  const [approvalKey, setApprovalKey] = useState("");

  const adjustMutation = trpc.admin.adjustCredits.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      toast.success("Créditos atualizados com sucesso.");
    },
    onError: (err: any) => toast.error("Erro ao ajustar créditos: " + err.message),
  });

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

  if (user && user.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-[#0a0a0f] text-foreground p-4 text-center">
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

        <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4 sm:p-5 overflow-hidden">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold">Usuários Cadastrados</h2>
          </div>
          <div className="overflow-x-auto -mx-4 px-4 sm:-mx-5 sm:px-5">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-zinc-400 text-xs">Nome</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Email</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Papel</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Créditos</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-zinc-500 text-xs">Carregando usuários...</TableCell></TableRow>
                ) : (usersData || []).map((u: any) => (
                  <TableRow key={u.id} className="border-white/10 hover:bg-white/[0.02]">
                    <TableCell className="font-medium text-xs min-w-[100px]">{u.name || "Sem nome"}</TableCell>
                    <TableCell className="text-zinc-400 text-xs min-w-[150px] break-all">{u.email}</TableCell>
                    <TableCell className="min-w-[80px]">
                      <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-violet-500/20 text-violet-300" : "bg-zinc-500/20 text-zinc-400"}`}>
                        {u.role}
                      </span>
                    </TableCell>
                    <TableCell className="text-violet-300 font-medium text-xs min-w-[60px]">{u.balance}</TableCell>
                    <TableCell className="min-w-[100px]">
                      <div className="flex gap-1.5">
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => adjustMutation.mutate({ userId: u.id, amount: 50 })}>
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => adjustMutation.mutate({ userId: u.id, amount: -50 })}>
                          <Minus className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </main>
    </div>
  );
}
