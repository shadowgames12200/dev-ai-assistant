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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type AgentStep = {
  id: number;
  type: "thinking" | "action" | "result" | "error";
  title: string;
  content: string;
  status: "pending" | "running" | "done" | "error";
  expanded: boolean;
};

type AgentTask = {
  id: number;
  goal: string;
  steps: AgentStep[];
  status: "idle" | "running" | "done" | "error";
  finalAnswer?: string;
};

const AGENT_EXAMPLES = [
  { icon: Globe, text: "Pesquise as últimas novidades sobre React 19 e me dê um resumo", desc: "Pesquisa Web" },
  { icon: Code2, text: "Crie um script Python completo para monitorar uso de CPU e memória", desc: "Geração de Código" },
  { icon: Terminal, text: "Explique passo a passo como configurar um servidor Nginx com SSL", desc: "Tutorial Técnico" },
  { icon: Zap, text: "Analise e otimize este algoritmo de busca: [cole seu código aqui]", desc: "Otimização" },
];

export default function Agent() {
  const [goal, setGoal] = useState("");
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [taskIdCounter, setTaskIdCounter] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const chatMutation = trpc.chat.send.useMutation({
    onSuccess: (data) => {
      const lastMsg = data.messages[data.messages.length - 1];
      if (lastMsg?.role === "assistant") {
        setTasks(prev => {
          const updated = [...prev];
          const current = updated[updated.length - 1];
          if (current) {
            current.status = "done";
            current.finalAnswer = lastMsg.content;
            current.steps = current.steps.map(s => ({ ...s, status: "done" }));
          }
          return updated;
        });
      }
      setIsRunning(false);
    },
    onError: () => {
      setTasks(prev => {
        const updated = [...prev];
        const current = updated[updated.length - 1];
        if (current) {
          current.status = "error";
          current.steps.push({
            id: Date.now(),
            type: "error",
            title: "Erro na execução",
            content: "Ocorreu um erro ao processar a tarefa. Tente novamente.",
            status: "error",
            expanded: true,
          });
        }
        return updated;
      });
      toast.error("Erro ao executar o agente.");
      setIsRunning(false);
    },
  });

  const createConvMutation = trpc.conversations.create.useMutation();

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

    const taskId = taskIdCounter;
    setTaskIdCounter(prev => prev + 1);

    // Simula passos do agente de forma progressiva
    const newTask: AgentTask = {
      id: taskId,
      goal: taskGoal,
      status: "running",
      steps: [
        {
          id: 1,
          type: "thinking",
          title: "Analisando objetivo",
          content: `Processando: "${taskGoal.slice(0, 80)}${taskGoal.length > 80 ? "..." : ""}"`,
          status: "running",
          expanded: true,
        },
      ],
    };

    setTasks(prev => [...prev, newTask]);

    // Adiciona passos progressivamente para simular raciocínio
    setTimeout(() => {
      setTasks(prev => {
        const updated = [...prev];
        const current = updated.find(t => t.id === taskId);
        if (current) {
          current.steps[0].status = "done";
          current.steps.push({
            id: 2,
            type: "action",
            title: "Executando com ferramentas disponíveis",
            content: "Usando capacidades de busca e geração de código conforme necessário...",
            status: "running",
            expanded: false,
          });
        }
        return updated;
      });
    }, 800);

    setTimeout(() => {
      setTasks(prev => {
        const updated = [...prev];
        const current = updated.find(t => t.id === taskId);
        if (current) {
          current.steps[1].status = "done";
          current.steps.push({
            id: 3,
            type: "result",
            title: "Gerando resposta final",
            content: "Compilando resultado...",
            status: "running",
            expanded: false,
          });
        }
        return updated;
      });

      // Cria conversa e envia para o LLM
      createConvMutation.mutate(
        { title: `Agente: ${taskGoal.slice(0, 40)}` },
        {
          onSuccess: (conv) => {
            chatMutation.mutate({
              conversationId: conv.id,
              content: `[MODO AGENTE] Objetivo: ${taskGoal}\n\nExecute esta tarefa de forma autônoma, usando todas as ferramentas disponíveis. Seja detalhado, estruturado e entregue um resultado completo e prático.`,
              useAdvancedReasoning: true,
            });
          },
          onError: () => {
            toast.error("Erro ao criar tarefa do agente.");
            setIsRunning(false);
          },
        }
      );
    }, 1600);
  };

  const toggleStep = (taskId: number, stepId: number) => {
    setTasks(prev =>
      prev.map(t =>
        t.id === taskId
          ? { ...t, steps: t.steps.map(s => s.id === stepId ? { ...s, expanded: !s.expanded } : s) }
          : t
      )
    );
  };

  const getStepIcon = (step: AgentStep) => {
    if (step.status === "running") return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    if (step.status === "done") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (step.status === "error") return <AlertCircle className="h-4 w-4 text-red-500" />;
    return <Circle className="h-4 w-4 text-muted-foreground" />;
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
            <p className="text-xs text-muted-foreground">Execução autônoma de tarefas complexas com raciocínio em cadeia</p>
          </div>
          <Badge variant="secondary" className="ml-auto text-xs">
            <Zap className="h-3 w-3 mr-1" />
            Beta
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
                      O agente executa tarefas complexas de forma autônoma, dividindo o objetivo em etapas, usando ferramentas e entregando resultados completos.
                    </p>
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
                      {task.status === "running" ? (
                        <Loader2 className="h-4 w-4 text-white animate-spin" />
                      ) : task.status === "done" ? (
                        <CheckCircle2 className="h-4 w-4 text-white" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-relaxed">{task.goal}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant={task.status === "done" ? "default" : task.status === "error" ? "destructive" : "secondary"}
                          className="text-xs"
                        >
                          {task.status === "running" ? "Executando..." : task.status === "done" ? "Concluído" : "Erro"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{task.steps.length} etapa(s)</span>
                      </div>
                    </div>
                  </div>

                  {/* Steps */}
                  <div className="divide-y">
                    {task.steps.map(step => (
                      <div key={step.id} className="px-4 py-3">
                        <button
                          onClick={() => toggleStep(task.id, step.id)}
                          className="flex items-center gap-2 w-full text-left"
                        >
                          {getStepIcon(step)}
                          <span className="flex-1 text-sm font-medium">{step.title}</span>
                          {step.expanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                        {step.expanded && (
                          <p className="mt-2 text-xs text-muted-foreground pl-6 leading-relaxed">{step.content}</p>
                        )}
                      </div>
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
                <span>Agente processando...</span>
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
            O agente usa raciocínio em cadeia e ferramentas para executar tarefas complexas.
          </p>
        </div>
      </div>
    </div>
  );
}
