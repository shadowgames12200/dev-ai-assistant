import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-[#0a0a0f] text-white">
          <div className="flex flex-col items-center w-full max-w-2xl p-8 rounded-2xl border border-white/10 bg-[#14141c] shadow-2xl">
            <AlertTriangle
              size={48}
              className="text-red-500 mb-6 flex-shrink-0"
            />

            <h2 className="text-xl font-bold mb-4 text-center">Ops! Algo deu errado</h2>
            <p className="text-sm text-zinc-400 text-center mb-8">
              Ocorreu um erro inesperado na interface. Tente recarregar a página para continuar.
            </p>

            {process.env.NODE_ENV === "development" && (
              <div className="p-4 w-full rounded bg-black/40 overflow-auto mb-6 border border-white/5">
                <pre className="text-xs text-red-400 whitespace-break-spaces">
                  {this.state.error?.stack}
                </pre>
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium",
                "bg-violet-600 text-white",
                "hover:bg-violet-500 transition-colors cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Recarregar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
