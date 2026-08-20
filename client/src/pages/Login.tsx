import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles, Lock, Mail, UserRound } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

type AuthMode = "login" | "register";

export default function Login() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 6) {
      toast.error("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (mode === "login" && !identifier.trim()) {
      toast.error("Informe o nome de usuário ou e-mail.");
      return;
    }
    if (mode === "register") {
      if (!name.trim() || !email.trim()) {
        toast.error("Preencha nome de usuário, e-mail e senha.");
        return;
      }
      if (password !== confirmPassword) {
        toast.error("A senha e a confirmação precisam ser iguais.");
        return;
      }
    }
    setLoading(true);
    try {
      const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(mode === "login" ? { identifier, password } : { name, email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível concluir o acesso");
      await utils.auth.me.invalidate();
      toast.success(mode === "login" ? "Login realizado com sucesso." : "Conta criada com sucesso.");
      setLocation("/chat");
    } catch (error: any) {
      toast.error(error.message || "Não foi possível concluir o acesso");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0a0f] p-4">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#14141c] p-7 shadow-2xl sm:p-8">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/20"><Sparkles className="h-6 w-6 text-violet-400" /></div>
          <div><h1 className="text-2xl font-bold text-white">DevAI Assistant</h1><p className="mt-1 text-sm text-zinc-400">Sua conta, suas conversas e seus créditos.</p></div>
        </div>

        <div className="mb-6 grid grid-cols-2 rounded-lg bg-white/[0.04] p-1" role="tablist" aria-label="Acesso à conta">
          <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => setMode("login")} className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${mode === "login" ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-white"}`}>Entrar</button>
          <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => setMode("register")} className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${mode === "register" ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-white"}`}>Cadastrar</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "login" ? (
            <div className="space-y-2"><Label htmlFor="identifier" className="text-zinc-300">Nome de usuário ou e-mail</Label><div className="relative"><UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><Input id="identifier" placeholder="Ex.: joao ou joao@email.com" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required autoComplete="username" className="bg-[#1e1e28] pl-9 text-white placeholder:text-zinc-500" /></div></div>
          ) : (
            <><div className="space-y-2"><Label htmlFor="name" className="text-zinc-300">Nome de usuário</Label><div className="relative"><UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><Input id="name" placeholder="Como quer aparecer?" value={name} onChange={(event) => setName(event.target.value)} required minLength={3} maxLength={40} autoComplete="username" className="bg-[#1e1e28] pl-9 text-white placeholder:text-zinc-500" /></div></div><div className="space-y-2"><Label htmlFor="email" className="text-zinc-300">E-mail</Label><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><Input id="email" type="email" placeholder="nome@exemplo.com" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" className="bg-[#1e1e28] pl-9 text-white placeholder:text-zinc-500" /></div></div></>
          )}
          <div className="space-y-2"><Label htmlFor="password" className="text-zinc-300">Senha</Label><div className="relative"><Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><Input id="password" type="password" placeholder="Sua senha" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} className="bg-[#1e1e28] pl-9 text-white placeholder:text-zinc-500" /></div></div>
          {mode === "register" && <div className="space-y-2"><Label htmlFor="confirm-password" className="text-zinc-300">Confirmar senha</Label><Input id="confirm-password" type="password" placeholder="Repita sua senha" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={6} autoComplete="new-password" className="bg-[#1e1e28] text-white placeholder:text-zinc-500" /></div>}
          <Button type="submit" className="w-full bg-violet-600 text-white hover:bg-violet-500" disabled={loading}>{loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}</Button>
        </form>
        <p className="mt-6 text-center text-xs text-zinc-500">{mode === "login" ? "Ainda não tem conta? Use a aba Cadastrar." : "Já possui uma conta? Use a aba Entrar."}</p>
      </section>
    </main>
  );
}
