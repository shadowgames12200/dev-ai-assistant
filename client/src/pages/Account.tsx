import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Lock, Mail, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

export default function Account() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setEmail(user.email || "");
    }
  }, [user]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword && newPassword !== confirmPassword) {
      toast.error("A nova senha e a confirmação precisam ser iguais.");
      return;
    }
    if (newPassword && newPassword.length < 6) {
      toast.error("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/auth/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, currentPassword, newPassword: newPassword || undefined }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível atualizar a conta");
      await utils.auth.me.invalidate();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Dados da conta atualizados com segurança.");
    } catch (error: any) {
      toast.error(error.message || "Não foi possível atualizar a conta");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0a0f] px-4 py-8 text-white">
      <section className="mx-auto w-full max-w-xl">
        <Button variant="ghost" className="mb-6 text-zinc-300 hover:text-white" onClick={() => setLocation("/chat")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para as conversas
        </Button>
        <div className="rounded-2xl border border-white/10 bg-[#14141c] p-6 shadow-2xl sm:p-8">
          <div className="mb-8 flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/20">
              <ShieldCheck className="h-5 w-5 text-violet-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Conta</h1>
              <p className="mt-1 text-sm text-zinc-400">Altere seu nome, e-mail ou senha. Para sua segurança, confirme a senha atual.</p>
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="account-name" className="text-zinc-200">Nome de usuário</Label>
              <div className="relative">
                <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input id="account-name" value={name} onChange={(event) => setName(event.target.value)} minLength={3} maxLength={40} required className="bg-[#1e1e28] pl-9 text-white" autoComplete="username" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-email" className="text-zinc-200">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input id="account-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="bg-[#1e1e28] pl-9 text-white" autoComplete="email" />
              </div>
            </div>
            <div className="border-t border-white/10 pt-5">
              <p className="mb-4 text-sm font-medium text-zinc-200">Alterar senha <span className="font-normal text-zinc-500">(opcional)</span></p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="account-new-password" className="text-zinc-300">Nova senha</Label>
                  <Input id="account-new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={6} className="bg-[#1e1e28] text-white" autoComplete="new-password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="account-confirm-password" className="text-zinc-300">Confirmar nova senha</Label>
                  <Input id="account-confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={6} className="bg-[#1e1e28] text-white" autoComplete="new-password" />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-current-password" className="text-zinc-200">Senha atual</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input id="account-current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required minLength={6} className="bg-[#1e1e28] pl-9 text-white" autoComplete="current-password" />
              </div>
            </div>
            <Button type="submit" className="w-full bg-violet-600 hover:bg-violet-500" disabled={saving}>
              {saving ? "Salvando..." : "Salvar alterações"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
