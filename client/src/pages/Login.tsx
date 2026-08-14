import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles, Lock, Mail } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

/**
 * Tela de login com e-mail e senha.
 * Auto-cadastro: se o usuário não existir, é criado automaticamente.
 */
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Preencha e-mail e senha.");
      return;
    }
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await response.text();
        console.error("[Auth] Non-JSON response:", text);
        if (text.includes("no healthy upstream") || response.status >= 500) {
          throw new Error(
            "Serviço temporariamente indisponível (erro no servidor). Tente novamente em instantes. Se o problema persistir, entre em contato com o administrador."
          );
        }
        throw new Error("Serviço temporariamente indisponível. Tente novamente em instantes.");
      }

      let data: any;
      try {
        data = await response.json();
      } catch {
        throw new Error("Erro ao processar resposta do servidor. Tente novamente.");
      }

      if (!response.ok) {
        throw new Error(data.error || "Erro ao fazer login");
      }

      // Invalidate auth.me so the app re-renders with the new user
      await utils.auth.me.invalidate();
      toast.success("Login realizado com sucesso!");
      setLocation("/chat");
    } catch (error: any) {
      console.error("[Auth] Login error:", error);
      toast.error(error.message || "Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0a0a0f] p-4">
      <div className="w-full max-w-md bg-[#14141c] border border-white/10 rounded-2xl shadow-2xl p-8">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="h-12 w-12 rounded-xl bg-violet-500/20 flex items-center justify-center">
            <Sparkles className="h-6 w-6 text-violet-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">DevAI Assistant</h1>
          <p className="text-sm text-zinc-400">Comece a criar com DevAI Assistant</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-zinc-300">E-mail</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                id="email"
                type="email"
                placeholder="Digite seu endereço de e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="pl-9 bg-[#1e1e28] border-white/10 text-white placeholder:text-zinc-500"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-zinc-300">Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                id="password"
                type="password"
                placeholder="Sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                minLength={6}
                className="pl-9 bg-[#1e1e28] border-white/10 text-white placeholder:text-zinc-500"
              />
            </div>
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              className="w-full bg-violet-600 hover:bg-violet-500 text-white"
              disabled={loading}
            >
              {loading ? "Carregando..." : "Continuar"}
            </Button>
          </div>
        </form>

        <p className="text-xs text-center text-zinc-500 mt-6">
          Se não tiver conta, será criada automaticamente.
        </p>
      </div>
    </div>
  );
}
