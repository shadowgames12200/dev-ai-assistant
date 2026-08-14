import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import Login from "./pages/Login";
import Chat from "./pages/Chat";
import Admin from "./pages/Admin";

function Router() {
  const { user, loading } = useAuth();

  // Public route: login page
  const LoginPage = () => {
    if (user) {
      window.location.href = "/chat";
      return null;
    }
    return <Login />;
  };

  // Protected route wrapper: redirects to login when not authenticated
  const Protected = ({ children }: { children: React.ReactNode }) => {
    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-[#0a0a0f]">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-400" />
            <p className="text-sm text-zinc-500">Carregando...</p>
          </div>
        </div>
      );
    }
    if (!user) {
      window.location.href = "/";
      return null;
    }
    return <>{children}</>;
  };

  return (
    <Switch>
      <Route path={"/"} component={LoginPage} />
      <Route path={"/chat"}>
        <Protected>
          <Chat />
        </Protected>
      </Route>
      <Route path={"/admin"}>
        <Protected>
          <Admin />
        </Protected>
      </Route>
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
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
