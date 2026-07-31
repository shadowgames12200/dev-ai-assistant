/**
 * Task Planner Module — Planejador de Tarefas Autônomo
 * 
 * Implementa um sistema de planejamento que divide tarefas complexas
 * em subtarefas executáveis, inspirado no Manus AI.
 * 
 * Funcionalidades:
 * - Decomposição automática de tarefas
 * - Planejamento com dependências
 * - Execução sequencial com feedback
 * - Reflexão e re-planejamento
 */

import { invokeGroqNonStream } from "./groq.js";

// ─── Types ───

export type Task = {
  id: string;
  goal: string;
  status: TaskStatus;
  plan: PlanStep[];
  currentStepIndex: number;
  results: string[];
  createdAt: string;
  updatedAt: string;
  error?: string;
};

export type TaskStatus = "planning" | "executing" | "completed" | "failed" | "cancelled";

export type PlanStep = {
  id: string;
  index: number;
  type: PlanStepType;
  title: string;
  description: string;
  status: StepStatus;
  result?: string;
  dependsOn?: string[];
  toolsNeeded?: string[];
  estimatedDuration?: string;
};

export type PlanStepType = "research" | "plan" | "execute" | "code" | "analyze" | "verify" | "output" | "reflect";

export type StepStatus = "pending" | "running" | "done" | "skipped" | "error";

export type PlanningResult = {
  plan: PlanStep[];
  estimatedSteps: number;
  complexity: "simple" | "moderate" | "complex";
  reasoning: string;
};

// ─── Task Storage ───

const tasks = new Map<string, Task>();

// ─── Task Management ───

export function createTask(goal: string): Task {
  const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const task: Task = {
    id,
    goal,
    status: "planning",
    plan: [],
    currentStepIndex: 0,
    results: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  tasks.set(id, task);
  return task;
}

export function getTask(taskId: string): Task | undefined {
  return tasks.get(taskId);
}

export function listTasks(): Task[] {
  return Array.from(tasks.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// ─── AI-Powered Planning ───

export async function planTask(goal: string): Promise<PlanningResult> {
  const prompt = `Você é um planejador de tarefas especializado. Analise o seguinte objetivo e crie um plano detalhado de execução.

OBJETIVO: ${goal}

Crie um plano com os seguintes critérios:
1. Divida em passos lógicos e executáveis
2. Identifique dependências entre passos
3. Sugira ferramentas necessárias para cada passo
4. Estime a complexidade

Responda em JSON:
{
  "reasoning": "Explicação do raciocínio para este plano",
  "complexity": "simple/moderate/complex",
  "plan": [
    {
      "id": "step_1",
      "type": "research/plan/execute/code/analyze/verify/output/reflect",
      "title": "Título do passo",
      "description": "Descrição detalhada do que fazer neste passo",
      "dependsOn": [],
      "toolsNeeded": ["web_search", "execute_code"],
      "estimatedDuration": "30s"
    }
  ]
}

Tipos de passos:
- research: Pesquisar informações necessárias
- plan: Organizar e estruturar a abordagem
- execute: Executar a ação principal
- code: Escrever código
- analyze: Analisar dados ou resultados
- verify: Verificar que o resultado está correto
- output: Entregar o resultado final ao usuário
- reflect: Refletir e ajustar o plano se necessário`;

  try {
    const response = await invokeGroqNonStream({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 1500,
      temperature: 0.3,
    });

    const aiMsg = response.choices[0]?.message?.content || "";
    let parsed: any;

    try {
      const jsonMatch = aiMsg.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      // Fallback: create a simple plan
      parsed = createFallbackPlan(goal);
    }

    const planSteps: PlanStep[] = (parsed.plan || []).map((step: any, index: number) => ({
      id: step.id || `step_${index + 1}`,
      index: index + 1,
      type: step.type || "execute",
      title: step.title || `Passo ${index + 1}`,
      description: step.description || "",
      status: "pending" as StepStatus,
      dependsOn: step.dependsOn || [],
      toolsNeeded: step.toolsNeeded || [],
      estimatedDuration: step.estimatedDuration || "30s",
    }));

    // Add an output step if not present
    const hasOutput = planSteps.some(s => s.type === "output");
    if (!hasOutput) {
      planSteps.push({
        id: `step_${planSteps.length + 1}`,
        index: planSteps.length + 1,
        type: "output",
        title: "Entregar resultado",
        description: "Apresentar o resultado final ao usuário de forma clara e estruturada",
        status: "pending",
        dependsOn: planSteps.length > 0 ? [planSteps[planSteps.length - 1].id] : [],
      });
    }

    return {
      plan: planSteps,
      estimatedSteps: planSteps.length,
      complexity: parsed.complexity || "moderate",
      reasoning: parsed.reasoning || "Plano gerado com base no objetivo fornecido",
    };
  } catch (err) {
    console.warn("[Planner] Failed to generate plan:", (err as Error).message);
    const fallback = createFallbackPlan(goal);
    return {
      plan: fallback.plan,
      estimatedSteps: fallback.plan.length,
      complexity: "moderate",
      reasoning: "Plano de fallback gerado automaticamente",
    };
  }
}

function createFallbackPlan(goal: string): any {
  return {
    reasoning: "Plano básico de fallback",
    complexity: "moderate",
    plan: [
      {
        id: "step_1",
        type: "plan",
        title: "Analisar o pedido",
        description: "Compreender o que o usuário precisa e identificar requisitos",
        dependsOn: [],
        toolsNeeded: [],
        estimatedDuration: "10s",
      },
      {
        id: "step_2",
        type: "execute",
        title: "Executar a tarefa",
        description: `Executar: ${goal.slice(0, 100)}`,
        dependsOn: ["step_1"],
        toolsNeeded: [],
        estimatedDuration: "60s",
      },
      {
        id: "step_3",
        type: "output",
        title: "Entregar resultado",
        description: "Apresentar o resultado final ao usuário",
        dependsOn: ["step_2"],
        toolsNeeded: [],
        estimatedDuration: "5s",
      },
    ],
  };
}

// ─── Task Execution ───

export async function executeTaskStep(
  taskId: string,
  stepId: string,
  previousResults: string[]
): Promise<{ success: boolean; result: string }> {
  const task = tasks.get(taskId);
  if (!task) {
    return { success: false, result: "Task not found" };
  }

  const step = task.plan.find(s => s.id === stepId);
  if (!step) {
    return { success: false, result: "Step not found" };
  }

  step.status = "running";
  task.updatedAt = new Date().toISOString();

  try {
    // Build execution context
    const contextParts = [
      `Objetivo: ${task.goal}`,
      `Passo atual: ${step.title} (${step.description})`,
    ];

    if (previousResults.length > 0) {
      contextParts.push(`Resultados anteriores:\n${previousResults.join("\n---\n")}`);
    }

    const workingMemory = previousResults.slice(-3).join("\n");

    const prompt = `Execute o seguinte passo de uma tarefa:

${contextParts.join("\n")}

Memória de trabalho:
${workingMemory || "Sem contexto anterior"}

Execute este passo de forma completa e detalhada. Entregue o resultado como texto estruturado.
Se o passo envolve código, gere o código completo.
Se envolve pesquisa, apresente as informações encontradas.
Se envolve análise, seja técnico e detalhado.`;

    const response = await invokeGroqNonStream({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Você é um executor de tarefas. Execute cada passo de forma completa, detalhada e profissional. Use Markdown para formatar. Entregue resultados úteis e acionáveis." },
        { role: "user", content: prompt },
      ],
      maxTokens: 3000,
      temperature: 0.4,
    });

    const result = response.choices[0]?.message?.content || "Sem resultado.";

    step.status = "done";
    step.result = result;
    task.results.push(result);
    task.currentStepIndex = task.plan.indexOf(step) + 1;
    task.updatedAt = new Date().toISOString();

    return { success: true, result };
  } catch (err) {
    step.status = "error";
    step.result = `Erro: ${(err as Error).message}`;
    task.updatedAt = new Date().toISOString();
    return { success: false, result: `Erro ao executar passo: ${(err as Error).message}` };
  }
}

// ─── Reflection & Re-planning ───

export async function reflectOnResults(
  goal: string,
  plan: PlanStep[],
  results: string[],
  lastResult: string
): Promise<{ needsReplan: boolean; newSteps?: PlanStep[]; reasoning: string }> {
  const prompt = `Você é um revisor de tarefas. Analise o progresso de uma tarefa e decida se precisa de re-planejamento.

OBJETIVO: ${goal}

PLANO ORIGINAL:
${plan.map(s => `${s.title}: ${s.status}`).join("\n")}

RESULTADO DO ÚLTIMO PASSO:
${lastResult.slice(0, 1000)}

TODOS OS RESULTADOS:
${results.slice(-3).map((r, i) => `Resultado ${i + 1}: ${r.slice(0, 300)}`).join("\n")}

Analise:
1. O resultado atende ao objetivo?
2. Há algo faltando?
3. Precisa de mais passos?

Responda em JSON:
{
  "needsReplan": true/false,
  "reasoning": "Explicação da decisão",
  "newSteps": [
    {"id": "new_1", "type": "execute", "title": "...", "description": "..."}
  ]
}`;

  try {
    const response = await invokeGroqNonStream({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 800,
      temperature: 0.2,
    });

    const aiMsg = response.choices[0]?.message?.content || "";
    let parsed: any;
    try {
      const jsonMatch = aiMsg.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { needsReplan: false, reasoning: "Tarefa concluída" };
    } catch {
      parsed = { needsReplan: false, reasoning: "Análise inconclusiva" };
    }

    if (parsed.newSteps) {
      const startIdx = plan.length + 1;
      parsed.newSteps = parsed.newSteps.map((s: any, i: number) => ({
        ...s,
        id: s.id || `new_${startIdx + i}`,
        index: startIdx + i,
        status: "pending" as StepStatus,
      }));
    }

    return {
      needsReplan: parsed.needsReplan || false,
      newSteps: parsed.newSteps,
      reasoning: parsed.reasoning || "",
    };
  } catch {
    return { needsReplan: false, reasoning: "Erro na reflexão, continuando com plano atual" };
  }
}

// ─── Full Task Execution Pipeline ───

export async function executeTaskFullPipeline(
  taskId: string,
  onStepUpdate?: (step: PlanStep, index: number) => void
): Promise<Task> {
  const task = tasks.get(taskId);
  if (!task) throw new Error("Task not found");

  task.status = "executing";

  for (let i = 0; i < task.plan.length; i++) {
    const step = task.plan[i];

    // Skip if depends on a failed step
    if (step.dependsOn?.some(depId => {
      const depStep = task.plan.find(s => s.id === depId);
      return depStep?.status === "error";
    })) {
      step.status = "skipped";
      onStepUpdate?.(step, i);
      continue;
    }

    const { success, result } = await executeTaskStep(
      taskId,
      step.id,
      task.results
    );

    if (!success && i === task.plan.length - 1) {
      // Last step failed — mark task as failed
      task.status = "failed";
      task.error = result;
      break;
    }

    onStepUpdate?.(step, i);

    // Check if we need re-planning (every 3 steps)
    if ((i + 1) % 3 === 0 && i < task.plan.length - 1) {
      const reflection = await reflectOnResults(
        task.goal,
        task.plan,
        task.results,
        result
      );

      if (reflection.needsReplan && reflection.newSteps) {
        // Append new steps
        for (const newStep of reflection.newSteps) {
          task.plan.push(newStep);
        }
        onStepUpdate?.({ ...step, result: `Re-planejado: ${reflection.reasoning}` }, i);
      }
    }
  }

  // Check final status
  const allDone = task.plan.every(s => s.status === "done" || s.status === "skipped");
  const hasErrors = task.plan.some(s => s.status === "error");

  if (allDone && !hasErrors) {
    task.status = "completed";
  } else if (hasErrors) {
    task.status = "failed";
  }

  task.updatedAt = new Date().toISOString();
  return task;
}

// ─── Agent Mode Integration ───

export async function runAgentMode(
  goal: string,
  userId: number
): Promise<{ task: Task; steps: PlanStep[] }> {
  const task = createTask(goal);

  // Step 1: Plan
  const planning = await planTask(goal);
  task.plan = planning.plan;

  // Step 2: Execute each step
  for (let i = 0; i < task.plan.length; i++) {
    const step = task.plan[i];

    if (step.dependsOn?.some(depId => {
      const depStep = task.plan.find(s => s.id === depId);
      return depStep?.status === "error";
    })) {
      step.status = "skipped";
      continue;
    }

    const { success, result } = await executeTaskStep(task.id, step.id, task.results);

    if (!success) {
      task.status = "failed";
      task.error = result;
      break;
    }
  }

  // Final check
  if (task.status !== "failed") {
    task.status = "completed";
  }

  return { task, steps: task.plan };
}
