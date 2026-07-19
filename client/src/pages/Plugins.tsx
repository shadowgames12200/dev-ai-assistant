import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Globe,
  Terminal,
  Code2,
  Database,
  FileText,
  Search,
  Calculator,
  Clock,
  Puzzle,
  Zap,
  CheckCircle2,
  Lock,
  ExternalLink,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type PluginStatus = "active" | "inactive" | "locked";

type Plugin = {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  icon: React.ElementType;
  category: "search" | "code" | "data" | "utility" | "integration";
  status: PluginStatus;
  version: string;
  author: string;
  capabilities: string[];
};

const INITIAL_PLUGINS: Plugin[] = [
  {
    id: "web_search",
    name: "Busca Web",
    description: "Pesquisa na internet em tempo real",
    longDescription: "Permite que a IA busque informações atualizadas na web, acesse documentações, notícias e qualquer conteúdo público disponível online.",
    icon: Globe,
    category: "search",
    status: "active",
    version: "1.2.0",
    author: "DevAI Core",
    capabilities: ["Busca em tempo real", "Acesso a documentações", "Notícias e artigos", "Dados públicos"],
  },
  {
    id: "code_executor",
    name: "Executor de Código",
    description: "Executa e testa código em sandbox seguro",
    longDescription: "Executa trechos de código em um ambiente isolado e seguro, permitindo testar scripts, verificar saídas e depurar problemas em tempo real.",
    icon: Terminal,
    category: "code",
    status: "active",
    version: "2.0.1",
    author: "DevAI Core",
    capabilities: ["Python", "JavaScript", "Bash", "Saída em tempo real", "Detecção de erros"],
  },
  {
    id: "code_analyzer",
    name: "Analisador de Código",
    description: "Análise estática e revisão de código",
    longDescription: "Analisa código em busca de bugs, vulnerabilidades de segurança, problemas de performance e sugere melhorias seguindo as melhores práticas.",
    icon: Code2,
    category: "code",
    status: "inactive",
    version: "1.0.3",
    author: "DevAI Labs",
    capabilities: ["Detecção de bugs", "Análise de segurança", "Sugestões de refatoração", "Métricas de qualidade"],
  },
  {
    id: "file_reader",
    name: "Leitor de Arquivos",
    description: "Lê e analisa arquivos enviados pelo usuário",
    longDescription: "Processa arquivos de código, texto, CSV, JSON, PDF e outros formatos, extraindo o conteúdo e permitindo análise completa pela IA.",
    icon: FileText,
    category: "data",
    status: "active",
    version: "1.5.0",
    author: "DevAI Core",
    capabilities: ["Código-fonte", "Texto e Markdown", "JSON e CSV", "PDF (extração básica)", "Logs e configs"],
  },
  {
    id: "database_query",
    name: "Consulta de Banco de Dados",
    description: "Gera e otimiza queries SQL",
    longDescription: "Ajuda a criar, otimizar e depurar queries SQL para diferentes bancos de dados, incluindo PostgreSQL, MySQL, SQLite e MongoDB.",
    icon: Database,
    category: "data",
    status: "inactive",
    version: "0.9.2",
    author: "DevAI Labs",
    capabilities: ["PostgreSQL", "MySQL", "SQLite", "Otimização de queries", "Modelagem de dados"],
  },
  {
    id: "smart_search",
    name: "Busca Semântica",
    description: "Busca inteligente por similaridade de conteúdo",
    longDescription: "Realiza buscas semânticas em documentos e conversas anteriores, encontrando conteúdo relacionado mesmo sem correspondência exata de palavras.",
    icon: Search,
    category: "search",
    status: "locked",
    version: "0.5.0",
    author: "DevAI Labs",
    capabilities: ["Busca por similaridade", "Indexação de conversas", "Recuperação contextual"],
  },
  {
    id: "calculator",
    name: "Calculadora Avançada",
    description: "Cálculos matemáticos e estatísticos complexos",
    longDescription: "Realiza operações matemáticas complexas, análises estatísticas, cálculos financeiros e conversões de unidades com alta precisão.",
    icon: Calculator,
    category: "utility",
    status: "inactive",
    version: "1.1.0",
    author: "DevAI Core",
    capabilities: ["Álgebra e cálculo", "Estatística", "Finanças", "Conversão de unidades"],
  },
  {
    id: "scheduler",
    name: "Agendador de Tarefas",
    description: "Agenda e gerencia tarefas automáticas",
    longDescription: "Permite criar lembretes, agendar tarefas recorrentes e automatizar fluxos de trabalho com base em horários e eventos.",
    icon: Clock,
    category: "utility",
    status: "locked",
    version: "0.3.0",
    author: "DevAI Labs",
    capabilities: ["Lembretes", "Tarefas recorrentes", "Automação de fluxos"],
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  search: "Busca",
  code: "Código",
  data: "Dados",
  utility: "Utilitários",
  integration: "Integrações",
};

const CATEGORY_COLORS: Record<string, string> = {
  search: "bg-blue-500/10 text-blue-500",
  code: "bg-violet-500/10 text-violet-500",
  data: "bg-amber-500/10 text-amber-500",
  utility: "bg-green-500/10 text-green-500",
  integration: "bg-pink-500/10 text-pink-500",
};

export default function Plugins() {
  const [plugins, setPlugins] = useState<Plugin[]>(INITIAL_PLUGINS);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);

  const categories = ["all", ...Array.from(new Set(INITIAL_PLUGINS.map(p => p.category)))];

  const filtered = selectedCategory === "all"
    ? plugins
    : plugins.filter(p => p.category === selectedCategory);

  const activeCount = plugins.filter(p => p.status === "active").length;

  const togglePlugin = (id: string) => {
    setPlugins(prev =>
      prev.map(p => {
        if (p.id !== id) return p;
        if (p.status === "locked") {
          toast.info("Este plugin estará disponível em breve.");
          return p;
        }
        const newStatus = p.status === "active" ? "inactive" : "active";
        toast.success(newStatus === "active" ? `Plugin "${p.name}" ativado!` : `Plugin "${p.name}" desativado.`);
        return { ...p, status: newStatus };
      })
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Header */}
      <div className="border-b px-6 py-4 bg-background/80 backdrop-blur">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25">
            <Puzzle className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Plugins</h1>
            <p className="text-xs text-muted-foreground">Gerencie as capacidades e ferramentas do DevAI</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              <Zap className="h-3 w-3 mr-1" />
              {activeCount} ativos
            </Badge>
            <Badge variant="outline" className="text-xs">
              {plugins.length} total
            </Badge>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="border-b px-6 py-3 bg-background/50">
        <div className="max-w-4xl mx-auto flex items-center gap-2 overflow-x-auto">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                selectedCategory === cat
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted hover:bg-accent text-muted-foreground hover:text-foreground"
              )}
            >
              {cat === "all" ? "Todos" : CATEGORY_LABELS[cat] ?? cat}
            </button>
          ))}
        </div>
      </div>

      {/* Plugins Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto py-6 px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(plugin => {
              const isExpanded = expandedPlugin === plugin.id;
              const Icon = plugin.icon;

              return (
                <div
                  key={plugin.id}
                  className={cn(
                    "rounded-2xl border bg-card shadow-sm transition-all overflow-hidden",
                    plugin.status === "locked" && "opacity-70",
                    isExpanded && "ring-1 ring-primary/30"
                  )}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                        plugin.status === "active"
                          ? "bg-gradient-to-br from-violet-500 to-purple-600 shadow-sm"
                          : "bg-muted"
                      )}>
                        <Icon className={cn("h-5 w-5", plugin.status === "active" ? "text-white" : "text-muted-foreground")} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold truncate">{plugin.name}</h3>
                          {plugin.status === "locked" && <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                          {plugin.status === "active" && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{plugin.description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", CATEGORY_COLORS[plugin.category])}>
                            {CATEGORY_LABELS[plugin.category]}
                          </span>
                          <span className="text-xs text-muted-foreground">v{plugin.version}</span>
                        </div>
                      </div>

                      <Switch
                        checked={plugin.status === "active"}
                        onCheckedChange={() => togglePlugin(plugin.id)}
                        disabled={plugin.status === "locked"}
                        className="shrink-0"
                      />
                    </div>

                    {/* Expand/Collapse */}
                    <button
                      onClick={() => setExpandedPlugin(isExpanded ? null : plugin.id)}
                      className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Info className="h-3.5 w-3.5" />
                      {isExpanded ? "Ocultar detalhes" : "Ver detalhes"}
                    </button>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t px-4 py-3 bg-muted/30 space-y-3">
                      <p className="text-xs text-muted-foreground leading-relaxed">{plugin.longDescription}</p>

                      <div>
                        <p className="text-xs font-semibold mb-1.5">Capacidades:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {plugin.capabilities.map((cap, i) => (
                            <span key={i} className="text-xs bg-background border rounded-md px-2 py-0.5">
                              {cap}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Por: <span className="font-medium text-foreground">{plugin.author}</span></span>
                        {plugin.status === "locked" && (
                          <Badge variant="outline" className="text-xs">
                            <Lock className="h-3 w-3 mr-1" />
                            Em breve
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Info Banner */}
          <div className="mt-6 rounded-xl border border-dashed bg-muted/30 p-4 flex items-start gap-3">
            <Puzzle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Plugins personalizados</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Em breve você poderá criar e instalar seus próprios plugins para expandir as capacidades do DevAI com integrações personalizadas.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
