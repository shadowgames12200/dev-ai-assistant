import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { useEffect, type ReactNode } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import Login from "./pages/Login";
import Chat from "./pages/Chat";
import Admin from "./pages/Admin";
import Account from "./pages/Account";
import Recharge from "./pages/Recharge";
import SharedConversation from "./pages/SharedConversation";
import AccountBlocked from "./components/AccountBlocked";
import { trpc } from "./lib/trpc";

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0a0a0f]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-400" />
        <p className="text-sm text-zinc-500">Carregando...</p>
      </div>
    </div>
  );
}

function LoginPage() {
  const { user, loading } = useAuth();
  const { data: blockStatus, isLoading: blockStatusLoading } = trpc.auth.blockStatus.useQuery(undefined, { retry: false });

  useEffect(() => {
    if (!loading && !blockStatusLoading && user && blockStatus?.blocked !== true) {
      window.location.replace("/chat");
    }
  }, [loading, user, blockStatusLoading, blockStatus?.blocked]);

  if (loading || blockStatusLoading) return <LoadingScreen />;
  if (blockStatus?.blocked) return <AccountBlocked status={blockStatus} />;
  if (user) return <LoadingScreen />;
  return <Login />;
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      window.location.replace("/");
    }
  }, [loading, user]);

  if (loading || !user) return <LoadingScreen />;
  return <>{children}</>;
}

function ChatPage() {
  return (
    <Protected>
      <Chat />
    </Protected>
  );
}

function AdminPage() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) setLocation("/");
    else if (!loading && user && user.role !== "admin") setLocation("/chat");
  }, [loading, user, setLocation]);

  if (loading || !user || user.role !== "admin") return <LoadingScreen />;
  return <Admin />;
}

function AccountPage() {
  return (
    <Protected>
      <Account />
    </Protected>
  );
}

function RechargePage() {
  return (
    <Protected>
      <Recharge />
    </Protected>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LoginPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/chat" component={ChatPage} />
      <Route path="/share/:token" component={SharedConversation} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/approvals" component={AdminPage} />
      <Route path="/account" component={AccountPage} />
      <Route path="/recharge" component={RechargePage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
