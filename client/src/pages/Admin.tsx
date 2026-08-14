import { toast } from "sonner";
import { useLocation } from "wouter";
import { ShieldCheck, ShieldOff, ArrowLeft, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
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
          Gerencie os usuários cadastrados e seus papéis (admin ou usuário comum).
        </p>

        {isLoading ? (
          <p className="text-sm text-zinc-500">Carregando...</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-white/10">
                <TableHead className="text-zinc-300">E-mail</TableHead>
                <TableHead className="text-zinc-300">Nome</TableHead>
                <TableHead className="text-zinc-300">Método de login</TableHead>
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
                    {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleString("pt-BR") : "-"}
                  </TableCell>
                  <TableCell className="text-right">
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
                        onClick={() => setRoleMutation.mutate({ id: u.id, role: "user" })}
                        disabled={u.id === user?.id}
                      >
                        <ShieldOff className="h-4 w-4 mr-1" />
                        Remover admin
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(!usersData || (usersData as any[]).length === 0) && (
                <TableRow className="border-white/10">
                  <TableCell colSpan={6} className="text-center text-zinc-500 py-8">
                    Nenhum usuário cadastrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </main>
    </div>
  );
}
