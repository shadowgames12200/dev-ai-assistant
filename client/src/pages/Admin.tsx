import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { ShieldCheck, ShieldOff, ArrowLeft, Users, Plus, Minus, Coins } from "lucide-react";
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
  const { data: creditsList } = trpc.credits.list.useQuery(undefined, {
    enabled: user?.role === "admin",
  });
  const creditsByUser = new Map(
    ((creditsList as any[]) || []).map((c: any) => [Number(c.id), Number(c.balance ?? 0)])
  );

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
          Gerencie os usuários cadastrados, os créditos e o custo por mensagem.
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

        {/* ---- Usuários e créditos ---- */}
        <section>
          {isLoading ? (
            <p className="text-sm text-zinc-500">Carregando...</p>
          ) : (
            <Table>
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
          )}
        </section>
      </main>
    </div>
  );
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
    const v = parseInt(amount, 10);
    if (isNaN(v) || v <= 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }
    onAdjust(email, v * sign);
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
