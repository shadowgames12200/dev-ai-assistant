import { Button } from "@/components/ui/button";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0a0f] text-white p-4">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-6">
          <div className="h-16 w-16 items-center justify-center rounded-full bg-violet-500/10 flex">
            <AlertCircle className="h-8 w-8 text-violet-400" />
          </div>
        </div>

        <h1 className="text-6xl font-bold text-white mb-2">404</h1>
        <h2 className="text-xl font-semibold text-zinc-300 mb-4">Página não encontrada</h2>
        <p className="text-zinc-500 mb-8 leading-relaxed">
          Desculpe, a página que você está procurando não existe ou foi movida.
        </p>

        <Button
          onClick={() => setLocation("/")}
          className="bg-violet-600 hover:bg-violet-500 text-white px-8 py-2.5 rounded-lg transition-all shadow-lg"
        >
          <Home className="w-4 h-4 mr-2" />
          Voltar ao início
        </Button>
      </div>
    </div>
  );
}
