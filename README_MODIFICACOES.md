# Modificações no Projeto DevAI Assistant

Este documento detalha as modificações realizadas no seu projeto DevAI Assistant para atender à sua solicitação de separar o login de administrador do fluxo de login de usuário comum.

## Resumo das Alterações

1.  **Criação de Página de Login de Administrador Dedicada**: Uma nova página (`AdminLogin.tsx`) foi criada para lidar exclusivamente com o login de administradores.
2.  **Remoção do Login de Administrador da Tela Principal**: Os campos de usuário e senha, juntamente com o botão "Login Admin", foram removidos da tela inicial (`DashboardLayout.tsx`) que os usuários comuns veem.
3.  **Nova Rota para Login de Administrador**: Uma nova rota (`/admin-login`) foi adicionada ao roteador da aplicação (`App.tsx`) para acessar a página de login de administrador.
4.  **Indicação de Acesso Administrativo**: Uma pequena nota foi adicionada à tela principal para informar o administrador sobre a nova URL de acesso.
5.  **Identificação de Problema no Login de Usuário Comum**: Foi identificado que o fluxo de login de usuário comum (`startLogin`) está inoperante devido à falta de configuração de variáveis de ambiente essenciais.

## Arquivos Modificados

-   `dev-ai-assistant/client/src/pages/AdminLogin.tsx` (NOVO ARQUIVO)
-   `dev-ai-assistant/client/src/components/DashboardLayout.tsx`
-   `dev-ai-assistant/client/src/App.tsx`
-   `dev-ai-assistant/client/src/const.ts` (Variáveis de ambiente mencionadas)

## Detalhes das Modificações

### 1. `dev-ai-assistant/client/src/pages/AdminLogin.tsx`

Este é um novo componente que contém a lógica e a interface para o login de administrador. Ele utiliza os campos de usuário e senha para autenticar via `/api/trpc/auth.login`.

```typescript
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/trpc/auth.login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: { username, password } }),
      });

      if (response.ok) {
        window.location.reload();
      } else {
        toast.error("Credenciais inválidas");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao conectar ao servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Login do Administrador</CardTitle>
          <CardDescription className="text-center">
            Acesso restrito para administradores
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Usuário</Label>
              <Input
                id="username"
                type="text"
                placeholder="Nome de usuário"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
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
            <div className="pt-2">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Carregando..." : "Login Admin"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

### 2. `dev-ai-assistant/client/src/components/DashboardLayout.tsx`

Os campos de login de administrador e o botão foram removidos. Uma linha de texto foi adicionada para guiar o administrador para a nova página de login.

**Trecho Removido:**

```html
          <div className="w-full space-y-4">
            <input id="admin-user" type="text" placeholder="Usuário" className="w-full p-2 border rounded bg-background" />
            <input id="admin-pass" type="password" placeholder="Senha" className="w-full p-2 border rounded bg-background" />
            <Button onClick={async () => {
              const u = (document.getElementById("admin-user") as HTMLInputElement).value;
              const p = (document.getElementById("admin-pass") as HTMLInputElement).value;
              try {
                const response = await fetch(\\'/api/trpc/auth.login\\', {
                  method: \\'POST\\',
                  headers: { \\'Content-Type\\': \\'application/json\\'}, 
                  body: JSON.stringify({ json: { username: u, password: p } })
                });
                if (response.ok) {
                  window.location.reload();
                } else {
                  alert(\\'Credenciais inválidas\\');
                }
              } catch(e) {
                alert(\\'Erro ao conectar ao servidor\\');
              } 
            }} className="w-full bg-secondary">Login Admin</Button>
          </div>
          <div className="relative w-full text-center py-2 text-xs text-muted-foreground">ou</div>
```

**Trecho Adicionado (para guiar o administrador):**

```html
              <p className="text-xs text-muted-foreground/50 italic mt-2">
                Para acesso administrativo, visite <a href="/admin-login" class="text-blue-400 hover:underline">/admin-login</a>
              </p>
```

### 3. `dev-ai-assistant/client/src/App.tsx`

A importação do novo componente `AdminLogin` e a rota correspondente foram adicionadas.

**Importação Adicionada:**

```typescript
import AdminLogin from "./pages/AdminLogin";
```

**Rota Adicionada:**

```typescript
      <Route path={"/admin-login"} component={AdminLogin} />
```

## Próximos Passos e Correção Crítica

### 1. Configuração das Variáveis de Ambiente (CRÍTICO)

O fluxo de login de usuário comum está atualmente inoperante devido à falta das variáveis de ambiente `VITE_OAUTH_PORTAL_URL` e `VITE_APP_ID`. Para corrigir isso, você **precisa** criar um arquivo `.env` na raiz do seu projeto (ou onde o Vite espera encontrar as variáveis de ambiente) e adicionar as seguintes linhas, substituindo os valores pelos corretos do seu provedor OAuth (provavelmente Supabase):

```
VITE_OAUTH_PORTAL_URL="https://<SEU_DOMINIO_SUPABASE>.supabase.co/auth/v1"
VITE_APP_ID="<SEU_APP_ID_SUPABASE>"
```

-   **`VITE_OAUTH_PORTAL_URL`**: Esta é a URL base do seu provedor de autenticação OAuth. Para Supabase, geralmente segue o formato `https://<project-ref>.supabase.co/auth/v1`.
-   **`VITE_APP_ID`**: Este é o ID da sua aplicação, conforme configurado no seu provedor OAuth.

**Sem essas configurações, o botão "Entrar" para usuários comuns não funcionará.**

### 2. Teste das Alterações

Após configurar as variáveis de ambiente e reconstruir o projeto:

-   Acesse a URL principal do seu site (`/`). Você deverá ver apenas o botão "Entrar" e a mensagem com o link para o login de administrador.
-   Clique em "Entrar" (após configurar as variáveis de ambiente) para testar o fluxo de login de usuário comum.
-   Acesse a rota `/admin-login` diretamente no navegador para verificar a nova página de login de administrador.
-   Tente fazer login como administrador usando suas credenciais.

## Como Aplicar as Mudanças

1.  **Crie o arquivo `AdminLogin.tsx`** no caminho `dev-ai-assistant/client/src/pages/AdminLogin.tsx` com o conteúdo fornecido acima.
2.  **Edite `dev-ai-assistant/client/src/components/DashboardLayout.tsx`** para remover o trecho de código do login de administrador e adicionar a mensagem de guia, conforme detalhado.
3.  **Edite `dev-ai-assistant/client/src/App.tsx`** para adicionar a importação e a rota para `AdminLogin`.
4.  **Crie ou atualize seu arquivo `.env`** na raiz do projeto com as variáveis `VITE_OAUTH_PORTAL_URL` e `VITE_APP_ID`.
5.  **Reconstrua e redeploy** seu projeto para que as alterações entrem em vigor.

Se precisar de ajuda para encontrar os valores das variáveis de ambiente ou para aplicar as mudanças, por favor, me avise.
