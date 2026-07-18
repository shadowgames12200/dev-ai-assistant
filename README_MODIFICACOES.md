# Modificações no Projeto DevAI Assistant

Este documento detalha as modificações realizadas no seu projeto DevAI Assistant para unificar o fluxo de login, remover a integração com Apple e implementar o reconhecimento de administrador via metadados do Supabase.

## Resumo das Alterações

1.  **Remoção do Login com Apple**: A opção de login com Apple foi removida da interface (`Login.tsx`) e o ícone correspondente (`apple-icon.svg`) foi excluído.
2.  **Unificação do Fluxo de Login**: A lógica de login de administrador foi integrada ao `Login.tsx`, eliminando a necessidade de uma página `AdminLogin.tsx` separada e sua rota (`/admin-login`). Agora, o `Login.tsx` lida tanto com o login de usuário comum (via Supabase) quanto com o login de administrador (via e-mail/senha).
3.  **Reconhecimento de Administrador via Supabase Metadados**: O backend (`server/_core/oauth.ts` e `server/db.ts`) foi atualizado para extrair a `role` do usuário dos metadados do Supabase (`user.app_metadata?.role`). Para que um usuário seja reconhecido como administrador, você deve configurar `role: 'admin'` nos metadados do seu usuário no painel do Supabase.
4.  **Remoção de Credenciais Hardcoded**: As credenciais de administrador hardcoded em `server/routers.ts` foram removidas, garantindo um fluxo de autenticação mais seguro e flexível.
5.  **Atualização de Variáveis de Ambiente**: O arquivo `.env.example` foi atualizado com placeholders para as variáveis de ambiente essenciais do Supabase, garantindo que o login de usuário comum funcione corretamente.
6.  **Atualização da Mensagem de Guia**: A mensagem na tela inicial (`DashboardLayout.tsx`) foi ajustada para guiar os administradores a usarem o login de e-mail/senha com suas credenciais de administrador na tela unificada.

## Arquivos Modificados

-   `dev-ai-assistant/client/src/pages/Login.tsx`
-   `dev-ai-assistant/client/public/apple-icon.svg` (REMOVIDO)
-   `dev-ai-assistant/client/src/components/DashboardLayout.tsx`
-   `dev-ai-assistant/server/_core/types/manusTypes.ts`
-   `dev-ai-assistant/server/_core/oauth.ts`
-   `dev-ai-assistant/server/db.ts`
-   `dev-ai-assistant/server/routers.ts`
-   `dev-ai-assistant/.env.example`

## Detalhes das Modificações

### 1. `dev-ai-assistant/client/src/pages/Login.tsx`

-   Removido o botão "Continuar com Apple".
-   A função `handleSocialLogin` foi atualizada para não incluir 'apple' como provedor.
-   A lógica de login de administrador e usuário comum foi unificada, com o formulário de e-mail/senha agora tratando ambos os casos.

### 2. `dev-ai-assistant/client/public/apple-icon.svg`

-   O arquivo do ícone da Apple foi removido do projeto.

### 3. `dev-ai-assistant/client/src/components/DashboardLayout.tsx`

-   A mensagem que guiava para `/admin-login` foi removida e substituída por uma instrução para usar o login de e-mail/senha na tela unificada.

### 4. `dev-ai-assistant/server/_core/types/manusTypes.ts`

-   Adicionada a propriedade `role?: string | null;` à interface `GetUserInfoResponse` e `GetUserInfoWithJwtResponse` para suportar o reconhecimento de função.

### 5. `dev-ai-assistant/server/_core/oauth.ts`

-   A função `registerOAuthRoutes` foi modificada para extrair `user.app_metadata?.role` e passá-lo para a função `db.upsertUser`.

### 6. `dev-ai-assistant/server/db.ts`

-   A função `upsertUser` foi atualizada para aceitar e persistir a propriedade `role` do usuário. Se `user.role` não for definido, mas o `openId` do usuário corresponder ao `ENV.ownerOpenId`, a `role` será definida como 'admin'. Caso contrário, o padrão é 'user'.

### 7. `dev-ai-assistant/server/routers.ts`

-   A lógica de login de administrador hardcoded na rota `auth.login` foi removida. Agora, este endpoint retornará um erro `FORBIDDEN`, pois o login de administrador será tratado via Supabase e verificação de `role`.

### 8. `dev-ai-assistant/.env.example`

-   Atualizado com placeholders para `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_OAUTH_PORTAL_URL`, e `VITE_APP_ID` para garantir que o login de usuário comum funcione corretamente após a configuração.

## Próximos Passos e Configuração Essencial

### 1. Configuração das Variáveis de Ambiente (CRÍTICO)

Para que o fluxo de login de usuário comum e o reconhecimento de administrador funcionem, você **precisa** criar um arquivo `.env` na raiz do seu projeto (ou onde o Vite espera encontrar as variáveis de ambiente) e adicionar as seguintes linhas, substituindo os valores pelos corretos do seu provedor Supabase:

```
VITE_SUPABASE_URL="https://<SEU_DOMINIO_SUPABASE>.supabase.co"
VITE_SUPABASE_ANON_KEY="<SUA_CHAVE_ANON_SUPABASE>"
VITE_OAUTH_PORTAL_URL="https://<SEU_DOMINIO_SUPABASE>.supabase.co/auth/v1"
VITE_APP_ID="<SEU_APP_ID_SUPABASE>"
```

-   **`VITE_SUPABASE_URL`**: A URL do seu projeto Supabase.
-   **`VITE_SUPABASE_ANON_KEY`**: A chave `anon` do seu projeto Supabase.
-   **`VITE_OAUTH_PORTAL_URL`**: A URL base do seu provedor de autenticação OAuth do Supabase.
-   **`VITE_APP_ID`**: O ID da sua aplicação, conforme configurado no seu provedor OAuth.

**Sem essas configurações, o login de usuário comum não funcionará.**

### 2. Configuração de Administrador no Supabase

Para que seu usuário seja reconhecido como administrador, siga estes passos no painel do Supabase:

1.  Vá para a seção **Authentication** -> **Users**.
2.  Encontre seu usuário na lista.
3.  Clique no usuário para editar seus detalhes.
4.  Na seção **App Metadata**, adicione ou edite o campo `role` com o valor `admin`. Por exemplo:

    ```json
    {
      "role": "admin"
    }
    ```

### 3. Teste das Alterações

Após configurar as variáveis de ambiente e o metadado de administrador no Supabase, e reconstruir/redeploy o projeto:

-   Acesse a URL principal do seu site (`/`). Você deverá ver as opções de login com Google, Microsoft e o formulário de e-mail/senha.
-   Tente fazer login com sua conta de administrador (com o metadado `role: 'admin'` configurado no Supabase). Você deverá ser reconhecido como administrador.
-   Tente fazer login com uma conta de usuário comum. Você deverá ser reconhecido como usuário.

Se precisar de ajuda para encontrar os valores das variáveis de ambiente ou para aplicar as mudanças, por favor, me avise.
