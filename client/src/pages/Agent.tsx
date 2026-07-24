import React, { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Streamdown } from "streamdown";
import {
  Bot,
  Send,
  Loader2,
  Sparkles,
  Terminal,
  Globe,
  Code2,
  Zap,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  AlertCircle,
  Clock,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type AgentStep = {
  id: string;
  type: "research" | "plan" | "execute" | "code" | "analyze" | "verify" | "output" | "reflect" | "thinking" | "action" | "result" | "error";
  title: string;
  description: string;
  status: "pending" | "running" | "done" | "skipped" | "error";
  result?: string;
  expanded: boolean;
  toolsNeeded?: string[];
};

type AgentTask = {
  id: string;
  goal: string;
  steps: AgentStep[];
  status: "planning" | "running" | "done" | "failed" | "cancelled";
  finalAnswer?: string;
  totalIterations?: number;
  duration?: number;
};

const AGENT_EXAMPLES = [
  { icon: Globe, text: "Pesquise as últimas novidades sobre React 19 e me dê um resumo completo", desc: "Pesquisa Web" },
  { icon: Code2, text: "Crie um script Python completo para monitorar uso de CPU e memória", desc: "Geração de Código" },
  { icon: Terminal, text: "Explique passo a passo como configurar um servidor Nginx com SSL", desc: "Tutorial Técnico" },
  { icon: Zap, text: "Analise e otimize este algoritmo de busca: [cole seu código aqui]", desc: "Otimização" },
];

function getStepIcon(step: AgentStep) {
  if (step.status === "running") return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
  if (step.status === "done") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (step.status === "error") return <AlertCircle className="h-4 w-4 text-red-500" />;
  if (step.status === "skipped") return <Circle className="h-4 w-4 text-muted-foreground/50" />;
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

function getStepTypeColor(step: AgentStep) {
  const colors: Record<string, string> = {
    research: "text-purple-500 bg-purple-500/10",
    plan: "text-blue-500 bg-blue-500/10",
    execute: "text-amber-500 bg-amber-500/10",
    code: "text-green-500 bg-green-500/10",
    analyze: "text-cyan-500 bg-cyan-500/10",
    verify: "text-emerald-500 bg-emerald-500/10",
    output: "text-indigo-500 bg-indigo-500/10",
    reflect: "text-pink-500 bg-pink-500/10",
    thinking: "text-blue-500 bg-blue-500/10",
    action: "text-amber-500 bg-amber-500/10",
    result: "text-green-500 bg-green-500/10",
    error: "text-red-500 bg-red-500/10",
  };
  return colors[step.type] || colors.plan;
}

function StepItem({ step, onToggle }: { step: AgentStep; onToggle: () => void }) {
  const colorClass = getStepTypeColor(step);

  return (
    <div className="px-4 py-3">
      <button
        onClick={onToggle}
        className="flex items-center gap-3 w-full text-left group"
      >
        {getStepIcon(step)}
        <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", colorClass)}>
          <span className="text-[10px] font-bold uppercase">{step.type.slice(0, 2)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium block truncate">{step.title}</span>
          {step.toolsNeeded && step.toolsNeeded.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {step.toolsNeeded.join(", ")}
            </span>
          )}
        </div>
        <Badge
          variant={
            step.status === "done" ? "default" :
            step.status === "running" ? "secondary" :
            step.status === "error" ? "destructive" :
            step.status === "skipped" ? "outline" : "outline"
          }
          className="text-[10px]"
        >
          {step.status === "running" ? "Executando..." :
           step.status === "done" ? "OK" :
           step.status === "error" ? "Erro" :
           step.status === "skipped" ? "Skip" : "Pendente"}
        </Badge>
        {step.expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </button>
      {step.expanded && step.result && (
        <div className="mt-2 ml-10 text-xs text-muted-foreground leading-relaxed bg-muted/30 rounded-lg p-3">
          <Streamdown>{step.result}</Streamdown>
        </div>
      )}
    </div>
  );
}

export default function Agent() {
  const [goal, setGoal] = useState("");
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const agentRunMutation = trpc.agent.run.useMutation({
    onSuccess: (data) => {
      if (!data.success) {
        toast.error("A tarefa do agente falhou em alguns passos.");
      } else {
        toast.success("Tarefa do agente concluída com sucesso!");
      }

      setTasks(prev => {
        const updated = [...prev];
        const lastTask = updated[updated.length - 1];
        if (lastTask) {
          lastTask.status = data.success ? "done" : "failed";
          lastTask.finalAnswer = data.stepResults.join("\n\n---\n\n");
        }
        return updated;
      });
      setIsRunning(false);
    },
    onError: (error: any) => {
      setTasks(prev => {
        const updated = [...prev];
        const lastTask = updated[updated.length - 1];
        if (lastTask) {
          lastTask.status = "failed";
        }
        return updated;
      });
      toast.error("Erro ao executar o agente.");
      setIsRunning(false);
    },
  });

  const scrollToBottom = () => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]") as HTMLDivElement;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [tasks, isRunning]);

  const handleRunAgent = async (taskGoal: string) => {
    if (!taskGoal.trim() || isRunning) return;

    setIsRunning(true);
    setGoal("");

    const taskId = `task_${Date.now()}`;

    // Create initial task with planning state
    const newTask: AgentTask = {
      id: taskId,
      goal: taskGoal,
      status: "planning",
      steps: [
        {
          id: "planning",
          type: "plan",
          title: "Analisando e planejando",
          description: "O agente está analisando o objetivo e criando um plano de execução...",
          status: "running",
          expanded: true,
        },
      ],
    };

    setTasks(prev => [...prev, newTask]);

    // Call the real agent backend
    agentRunMutation.mutate({ goal: taskGoal });

    // Poll for progress (simulated with step updates)
    const pollInterval = setInterval(() => {
      setTasks(prev => {
        const updated = [...prev];
        const current = updated.find(t => t.id === taskId);
        if (current && current.status === "running") {
          // Check if we should add progress steps
          const doneSteps = current.steps.filter(s => s.status === "done").length;
          const totalSteps = current.steps.length;

          // Add a progress step if needed
          if (doneSteps === 0 && current.steps.some(s => s.type === "plan")) {
            current.steps = [
              {
                id: "plan_done",
                type: "plan",
                title: "Plano criado",
                description: "O plano foi gerado com sucesso. Iniciando execução...",
                status: "done",
                expanded: false,
              },
              {
                id: "exec_start",
                type: "execute",
                title: "Executando tarefa",
                description: "O agente está trabalhando na tarefa. Aguarde...",
                status: "running",
                expanded: true,
              },
            ];
          }
        }
        return updated;
      });
    }, 2000);

    // Clean up interval when done
    const cleanup = () => clearInterval(pollInterval);
    // The mutation will eventually complete and we'll handle it via onSuccess
  };

  const toggleStep = (taskId: string, stepId: string) => {
    setTasks(prev =>
      prev.map(t =>
        t.id === taskId
          ? { ...t, steps: t.steps.map(s => s.id === stepId ? { ...s, expanded: !s.expanded } : s) }
          : t
      )
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Header */}
      <div className="border-b px-6 py-4 bg-background/80 backdrop-blur">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/25">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Agente DevAI</h1>
            <p className="text-xs text-muted-foreground">Execução autônoma de tarefas complexas com planejamento, ferramentas e reflexão</p>
          </div>
          <Badge variant="secondary" className="ml-auto text-xs">
            <Zap className="h-3 w-3 mr-1" />
            v2.0
          </Badge>
        </div>
      </div>

      {/* Tasks Area */}
      <div ref={scrollRef} className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
            {tasks.length === 0 ? (
              <div className="space-y-8">
                <div className="flex flex-col items-center gap-4 py-8">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/25">
                    <Bot className="h-8 w-8 text-white" />
                  </div>
                  <div className="text-center space-y-2">
                    <h2 className="text-xl font-bold">Modo Agente</h2>
                    <p className="text-sm text-muted-foreground max-w-md">
                      O agente executa tarefas complexas de forma autônoma, planejando passos, usando ferramentas, refletindo sobre resultados e iterando até completar o objetivo.
                    </p>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Brain className="h-3 w-3" /> Planejamento IA</span>
                    <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> Ferramentas</span>
                    <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3" /> Reflexão</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {AGENT_EXAMPLES.map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => handleRunAgent(ex.text)}
                      disabled={isRunning}
                      className="group flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-all hover:shadow-md hover:border-blue-500/30 hover:bg-accent/50 disabled:opacity-50"
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20 transition-colors">
                        <ex.icon className="h-4 w-4" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-tight">{ex.desc}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{ex.text}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              tasks.map(task => (
                <div key={task.id} className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                  {/* Task Header */}
                  <div className="flex items-start gap-3 p-4 border-b bg-muted/30">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600">
                      {task.status === "running" || task.status === "planning" ? (
                        <Loader2 className="h-4 w-4 text-white animate-spin" />
                      ) : task.status === "done" ? (
                        <CheckCircle2 className="h-4 w-4 text-white" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-relaxed">{task.goal}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge
                          variant={task.status === "done" ? "default" : task.status === "failed" ? "destructive" : "secondary"}
                          className="text-xs"
                        >
                          {task.status === "running" ? "Executando..." :
                           task.status === "planning" ? "Planejando..." :
                           task.status === "done" ? "Concluído" : "Falhou"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {task.steps.length} passo(s)
                        </span>
                        {task.status === "done" && (
                          <span className="text-xs text-green-600">
                            {task.steps.filter(s => s.status === "done").length}/{task.steps.length} concluídos
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Steps */}
                  <div className="divide-y">
                    {task.steps.map(step => (
                      <StepItem
                        key={step.id}
                        step={step}
                        onToggle={() => toggleStep(task.id, step.id)}
                      />
                    ))}
                  </div>

                  {/* Final Answer */}
                  {task.finalAnswer && (
                    <div className="p-4 border-t bg-background">
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-semibold text-blue-500">Resultado</span>
                      </div>
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-lg">
                        <Streamdown>{task.finalAnswer}</Streamdown>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}

            {isRunning && tasks.length > 0 && !tasks[tasks.length - 1]?.finalAnswer && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground px-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Agente processando... Isso pode levar alguns instantes.</span>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Input */}
      <div className="p-4 border-t bg-background/80 backdrop-blur">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={(e) => { e.preventDefault(); handleRunAgent(goal); }}
            className="flex items-end gap-3"
          >
            <Textarea
              ref={textareaRef}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleRunAgent(goal); }
              }}
              placeholder="Descreva a tarefa para o agente executar de forma autônoma..."
              className="flex-1 resize-none min-h-[44px] max-h-32 rounded-xl border bg-background focus-visible:ring-1 focus-visible:ring-blue-500"
              rows={1}
              disabled={isRunning}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!goal.trim() || isRunning}
              className="shrink-0 h-11 w-11 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 shadow-md border-0"
            >
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground/70">
            O agente planeja, executa com ferramentas, reflete e itera até completar a tarefa.
          </p>
        </div>
      </div>
    </div>
  );
}
