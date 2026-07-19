import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Sparkles } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Primeiro, tentar fazer login
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Se o erro for "Invalid login credentials" ou "email_not_confirmed",
        // tentar cadastrar o usuário automaticamente
        const shouldAutoRegister = 
          error.message.includes("Invalid login credentials") ||
          error.message.includes("email_not_confirmed") ||
          error.message.includes("User not found");

        if (shouldAutoRegister) {
          console.log("[Auth] Tentando cadastro automático...");
          // Tentar registrar o usuário
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                name: email.split('@')[0],
              },
            },
          });

          if (signUpError) {
            throw new Error(signUpError.message || "Erro ao criar conta");
          }

          // Se o signUp retornou sessão, o login foi automático
          if (signUpData.session) {
            console.log("[Auth] Cadastro automático bem-sucedido, sessão obtida");
            await syncSession(signUpData.session.access_token, signUpData.session.refresh_token);
            toast.success("Conta criada e login realizado!");
            window.location.href = "/";
            return;
          }

          // Se não retornou sessão (email confirmation), tentar login novamente
          const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (loginError) {
            // Se ainda falhou, provavelmente precisa de confirmação de email
            // Tentar usar magic link como fallback
            if (loginError.message.includes("email_not_confirmed")) {
              toast.error("Por favor, confirme seu email. Um link foi enviado para você.");
              const { error: resendError } = await supabase.auth.resend({
                type: "signup",
                email,
              });
              if (resendError) {
                console.error("[Auth] Erro ao reenviar email:", resendError.message);
              }
              return;
            }
            throw loginError;
          }

          if (loginData.session) {
            await syncSession(loginData.session.access_token, loginData.session.refresh_token);
            toast.success("Login realizado com sucesso!");
            window.location.href = "/";
            return;
          }
        }

        throw error;
      }

      // Login bem-sucedido
      if (data.session) {
        await syncSession(data.session.access_token, data.session.refresh_token);
        toast.success("Login realizado com sucesso!");
        window.location.href = "/";
      } else {
        throw new Error("Nenhuma sessão retornada pelo Supabase");
      }
    } catch (error: any) {
      console.error("[Auth] Login error:", error);
      toast.error(error.message || "Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  };

  const syncSession = async (accessToken: string, refreshToken?: string) => {
    const response = await fetch("/api/auth/supabase-callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "Unknown error");
      console.error("Auth sync error details:", errText);
      let errorMessage = "Falha ao sincronizar sessão com o servidor";
      try {
        const errData = JSON.parse(errText);
        errorMessage = errData.error || errorMessage;
      } catch (e) {}
      throw new Error(errorMessage);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'azure') => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/api/auth/supabase-callback`,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      toast.error(error.message || `Erro ao fazer login com ${provider}`);
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Entrar ou cadastrar-se</CardTitle>
          <CardDescription className="text-center">
            Comece a criar com DevAI Assistant
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 mb-6">
            <Button
              variant="outline"
              className="w-full flex items-center justify-center gap-2"
              onClick={() => handleSocialLogin('google')}
              disabled={loading}
            >
              <img src="/google-icon.svg" alt="Google" className="h-5 w-5" />
              Continuar com Google
            </Button>
            <Button
              variant="outline"
              className="w-full flex items-center justify-center gap-2"
              onClick={() => handleSocialLogin('azure')}
              disabled={loading}
            >
              <img src="/microsoft-icon.svg" alt="Microsoft" className="h-5 w-5" />
              Continuar com Microsoft
            </Button>
          </div>

          <div className="relative flex justify-center text-xs uppercase mb-6">
            <span className="bg-card px-2 text-muted-foreground">Ou faça login com e-mail e senha</span>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="Digite seu endereço de e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="Sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="pt-4">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Carregando..." : "Continuar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
