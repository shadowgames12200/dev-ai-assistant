import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Agent from "./pages/Agent";
import Plugins from "./pages/Plugins";
import Scheduled from "./pages/Scheduled";
import Library from "./pages/Library";
import Projects from "./pages/Projects";
import Login from "./pages/Login";


function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/agent"} component={Agent} />
      <Route path={"/plugins"} component={Plugins} />
      <Route path={"/scheduled"} component={Scheduled} />
      <Route path={"/library"} component={Library} />
      <Route path={"/projects"} component={Projects} />
      <Route path={"/login"} component={Login} />

      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
