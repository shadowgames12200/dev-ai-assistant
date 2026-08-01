/**
 * Agent Loop Module — Loop de Agente Autônomo
 * 
 * Implementa o loop principal de um agente autônomo que:
 * 1. Recebe um objetivo
 * 2. Planeja os passos
 * 3. Executa cada passo com ferramentas
 * 4. Reflete sobre resultados
 * 5. Itera até completar
 * 6. Entrega o resultado final
 * 
 * Inspirado no loop de agente do Manus AI.
 */

import { invokeGroq, invokeGroqNonStream, type GroqMessage, type GroqInvokeParams, type GroqResponse } from "./groq.js";
import { invokeLLMWithFallback, type GeminiContent, invokeGemini, extractTextFromGeminiResponse, convertToGeminiContents } from "./gemini.js";
import { tools, toolHandlers } from "./tools.js";
import {
  createTask,
  planTask,
  executeTaskStep,
  type Task,
  type PlanStep,
} from "./planner.js";
import {
  createAgentContext,
  addAgentStep,
  addToWorkingMemory,
} from "./memory.js";

// ─── Types ───

export type AgentLoopConfig = {
  maxIterations: number;
  maxToolCalls: number;
  model: string;
  temperature: number;
  maxTokens: number;
};

export type AgentIteration = {
  iteration: number;
  type: "thinking" | "tool_call" | "tool_result" | "reflection" | "output";
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  duration: number;
};

export type AgentResult = {
  success: boolean;
  iterations: AgentIteration[];
  finalOutput: string;
  totalIterations: number;
  totalDuration: number;
  error?: string;
};

// Extended Groq message that supports tool_calls (from the API response)
type ExtendedGroqMessage = GroqMessage & {
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

// ─── Agent Loop ───

const DEFAULT_CONFIG: AgentLoopConfig = {
  maxIterations: 15,
  maxToolCalls: 10,
  model: "llama-3.3-70b-versatile",
  temperature: 0.4,
  maxTokens: 4000,
};

/**
 * Run the autonomous agent loop.
 * This is the core function that powers the agent mode.
 */
export async function runAgentLoop(
  goal: string,
  config: Partial<AgentLoopConfig> = {}
): Promise<AgentResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const iterations: AgentIteration[] = [];
  let toolCallCount = 0;
  const startTime = Date.now();

  // Step 1: Create task and plan
  const task = createTask(goal);
  const taskId = task.id;
  const agentCtx = createAgentContext(goal, taskId);

  try {
    // Step 2: Plan the task
    const planningStart = Date.now();
    const planning = await planTask(goal);
    task.plan = planning.plan;

    // Add plan steps to agent context
    for (const step of planning.plan) {
      addAgentStep(taskId, {
        id: step.id,
        type: step.type as "plan" | "execute" | "tool_use" | "reflection" | "output",
        title: step.title,
        description: step.description,
      });
    }

    iterations.push({
      iteration: 1,
      type: "thinking",
      content: `Plano criado com ${planning.estimatedSteps} passos. Complexidade: ${planning.complexity}.\nRaciocínio: ${planning.reasoning}`,
      duration: Date.now() - planningStart,
    });

    // Step 3: Execute the agent loop using Groq messages
    const conversationHistory: GroqMessage[] = [
      {
        role: "system",
        content: buildAgentSystemPrompt(goal, planning),
      },
    ];

    for (let iteration = 1; iteration <= cfg.maxIterations; iteration++) {
      // Build request payload using Groq types
      const requestPayload: GroqInvokeParams & { tools?: any[]; tool_choice?: any; temperature?: number; max_tokens?: number } = {
        model: cfg.model,
        messages: conversationHistory as any,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
      };

      // Add tools if available and we haven't hit the limit
      if (tools.length > 0 && toolCallCount < cfg.maxToolCalls) {
        requestPayload.tools = tools;
        requestPayload.tool_choice = "auto";
      }

      const planningCallStart = Date.now();
      let response: GroqResponse | null = null;
      let geminiFallbackUsed = false;
      try {
        response = await invokeGroqNonStream(requestPayload);
      } catch (groqErr) {
        console.warn("[Agent] Groq failed, trying Gemini fallback...", (groqErr as Error).message);
        try {
          const geminiContents = convertToGeminiContents(requestPayload.messages as any);
          const geminiResponse = await invokeGemini({
            contents: geminiContents,
            model: "gemini-2.0-flash",
            temperature: requestPayload.temperature,
            maxOutputTokens: requestPayload.maxTokens,
          });
          const text = extractTextFromGeminiResponse(geminiResponse as any);
          // Wrap Gemini response in Groq-like format for compatibility
          response = {
            id: "gemini-fallback",
            model: "gemini-2.0-flash",
            choices: [{
              index: 0,
              message: { role: "assistant", content: text },
              finish_reason: "stop",
            }],
            usage: { total_tokens: 0 },
          } as any;
          geminiFallbackUsed = true;
        } catch (geminiErr) {
          throw new Error(`Groq: ${(groqErr as Error).message} | Gemini: ${(geminiErr as Error).message}`);
        }
      }
      const responseTime = Date.now() - planningCallStart;

      const message = response?.choices[0]?.message as ExtendedGroqMessage;
      if (!message) {
        iterations.push({
          iteration,
          type: "thinking",
          content: "Sem resposta do modelo. Encerrando.",
          duration: responseTime,
        });
        break;
      }

      const content = message.content;
      const toolCalls = message.tool_calls;

      // Process tool calls
      if (toolCalls && toolCalls.length > 0 && toolCallCount < cfg.maxToolCalls) {
        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name;
          let toolArgs: Record<string, unknown>;
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            toolArgs = {};
          }

          toolCallCount++;

          iterations.push({
            iteration,
            type: "tool_call",
            content: `Chamando ${toolName}...`,
            toolName,
            toolArgs,
            duration: Date.now() - planningCallStart,
          });

          // Execute tool
          const handler = toolHandlers[toolName];
          if (handler) {
            const toolResultStart = Date.now();
            const result = await handler(toolArgs);
            const toolDuration = Date.now() - toolResultStart;

            addToWorkingMemory(taskId, `${toolName}: ${result.slice(0, 500)}`);

            iterations.push({
              iteration,
              type: "tool_result",
              content: result.slice(0, 2000),
              toolName,
              toolResult: result,
              duration: toolDuration,
            });

            // Add tool call + result to conversation as raw Groq messages
            // We need to send the tool call and result back to the LLM
            conversationHistory.push({
              role: "assistant",
              content: "",
            } as any);
            (conversationHistory[conversationHistory.length - 1] as any).tool_calls = toolCalls;

            conversationHistory.push({
              role: "assistant" as any,
              content: `[${toolName}]: ${result.slice(0, 4000)}`,
            } as any);
            (conversationHistory[conversationHistory.length - 1] as any).role = "tool";
            (conversationHistory[conversationHistory.length - 1] as any).name = toolName;
            (conversationHistory[conversationHistory.length - 1] as any).tool_call_id = toolCall.id;
          } else {
            iterations.push({
              iteration,
              type: "tool_result",
              content: `Ferramenta não disponível: ${toolName}`,
              toolName,
              duration: 0,
            });
          }
        }
      } else {
        // No tool calls — this is the final output
        const textContent = typeof content === "string" ? content : "";
        if (textContent) {
          iterations.push({
            iteration,
            type: "output",
            content: textContent.slice(0, 5000),
            duration: responseTime,
          });

          // Mark task as completed
          task.status = "completed";
          task.results.push(textContent);

          return {
            success: true,
            iterations,
            finalOutput: textContent,
            totalIterations: iteration,
            totalDuration: Date.now() - startTime,
          };
        }
      }
    }

    // If we exhausted iterations, generate a final summary
    let finalResponse: GroqResponse | null = null;
    try {
      finalResponse = await invokeGroqNonStream({
        model: cfg.model,
        messages: conversationHistory as any,
        maxTokens: cfg.maxTokens,
      });
    } catch (groqErr) {
      console.warn("[Agent] Final summary Groq failed, trying Gemini fallback...");
      try {
        const geminiContents = convertToGeminiContents(conversationHistory as any);
        const geminiResponse = await invokeGemini({
          contents: geminiContents,
          model: "gemini-2.0-flash",
          maxOutputTokens: cfg.maxTokens,
        });
        const text = extractTextFromGeminiResponse(geminiResponse as any);
        finalResponse = {
          id: "gemini-fallback",
          model: "gemini-2.0-flash",
          choices: [{
            index: 0,
            message: { role: "assistant", content: text },
            finish_reason: "stop",
          }],
          usage: { total_tokens: 0 },
        } as any;
      } catch (geminiErr) {
        throw new Error(`Groq: ${(groqErr as Error).message} | Gemini: ${(geminiErr as Error).message}`);
      }
    }

    const finalContent = finalResponse?.choices[0]?.message?.content || "Não foi possível completar a tarefa no tempo limite.";

    iterations.push({
      iteration: iterations.length + 1,
      type: "output",
      content: finalContent.slice(0, 5000),
      duration: 0,
    });

    task.status = "completed";
    task.results.push(finalContent);

    return {
      success: true,
      iterations,
      finalOutput: finalContent,
      totalIterations: iterations.length,
      totalDuration: Date.now() - startTime,
    };
  } catch (err) {
    task.status = "failed";
    task.error = (err as Error).message;

    return {
      success: false,
      iterations,
      finalOutput: `Erro ao executar o agente: ${(err as Error).message}`,
      totalIterations: iterations.length,
      totalDuration: Date.now() - startTime,
      error: (err as Error).message,
    };
  }
}

// ─── Agent System Prompt ───

function buildAgentSystemPrompt(goal: string, planning: { plan: PlanStep[]; complexity: string; reasoning: string }): string {
  return `Você é o DevAI Agent, um agente autônomo capaz de executar tarefas complexas de forma independente.

=== OBJETIVO ===
${goal}

=== PLANO DE EXECUÇÃO ===
${planning.plan.map((s, i) => `${i + 1}. [${s.type}] ${s.title} — ${s.description}`).join("\n")}

Complexidade: ${planning.complexity}
Raciocínio: ${planning.reasoning}

=== REGRAS DO AGENTE ===
1. PENSE antes de agir — analise o problema antes de executar
2. USE FERRAMENTAS quando necessário — web_search para pesquisa, execute_code para cálculos
3. VERIFIQUE resultados — não assuma que algo funcionou sem checar
4. ITERE se necessário — se algo falhar, tente uma abordagem diferente
5. SEJA COMPLETO — não pare no meio, entregue o resultado final inteiro
6. FORMATO PROFISSIONAL — use Markdown, tabelas, código formatado

=== FERRAMENTAS DISPONÍVEIS ===
- web_search: Pesquisar informações na web
- execute_code: Executar código JavaScript/Node.js

=== IMPORTANTE ===
- Sempre explique o que está fazendo antes de fazer
- Quando terminar, dê uma resposta final completa e estruturada
- NUNCA deixe a tarefa incompleta`;
}

// ─── Enhanced Chat with Tool Loop ───

/**
 * Enhanced chat that supports tool calling in a loop.
 * This replaces the simple chat.send for more complex interactions.
 */
export async function enhancedChat(
  messages: GroqMessage[],
  options: Partial<AgentLoopConfig> = {}
): Promise<{ content: string; toolCalls: number; iterations: number }> {
  const cfg = { ...DEFAULT_CONFIG, ...options };
  let toolCallCount = 0;

  const conversationHistory: GroqMessage[] = [...messages];

  for (let i = 0; i < cfg.maxIterations; i++) {
    const requestPayload: GroqInvokeParams & { tools?: any[]; tool_choice?: any; temperature?: number; max_tokens?: number } = {
      model: cfg.model,
      messages: conversationHistory as any,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
    };

    if (tools.length > 0 && toolCallCount < cfg.maxToolCalls) {
      requestPayload.tools = tools;
      requestPayload.tool_choice = "auto";
    }

    let response: GroqResponse | null = null;
    try {
      response = await invokeGroqNonStream(requestPayload);
    } catch (groqErr) {
      console.warn("[Chat] Groq failed, trying Gemini fallback...");
      try {
        const geminiContents = convertToGeminiContents(requestPayload.messages as any);
        const geminiResponse = await invokeGemini({
          contents: geminiContents,
          model: "gemini-2.0-flash",
          temperature: requestPayload.temperature,
          maxOutputTokens: requestPayload.maxTokens,
        });
        const text = extractTextFromGeminiResponse(geminiResponse as any);
        response = {
          id: "gemini-fallback",
          model: "gemini-2.0-flash",
          choices: [{
            index: 0,
            message: { role: "assistant", content: text },
            finish_reason: "stop",
          }],
          usage: { total_tokens: 0 },
        } as any;
      } catch (geminiErr) {
        throw new Error(`Groq: ${(groqErr as Error).message} | Gemini: ${(geminiErr as Error).message}`);
      }
    }
    const message = response?.choices[0]?.message as ExtendedGroqMessage;

    if (!message) break;

    const toolCalls = message.tool_calls;

    if (toolCalls && toolCalls.length > 0 && toolCallCount < cfg.maxToolCalls) {
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        let toolArgs: Record<string, unknown>;
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          toolArgs = {};
        }

        toolCallCount++;

        const handler = toolHandlers[toolName];
        if (handler) {
          const result = await handler(toolArgs);

          conversationHistory.push({
            role: "assistant",
            content: "",
          } as any);
          (conversationHistory[conversationHistory.length - 1] as any).tool_calls = toolCalls;

          conversationHistory.push({
            role: "assistant" as any,
            content: `[${toolName}]: ${result.slice(0, 4000)}`,
          } as any);
          (conversationHistory[conversationHistory.length - 1] as any).role = "tool";
          (conversationHistory[conversationHistory.length - 1] as any).name = toolName;
          (conversationHistory[conversationHistory.length - 1] as any).tool_call_id = toolCall.id;
        } else {
          // Tool not available, add error
          conversationHistory.push({
            role: "assistant",
            content: `[${toolName}]: Ferramenta não disponível no momento.`,
          } as any);
        }
      }
    } else {
      // No more tool calls — return final content
      const content = typeof message.content === "string" ? message.content : "";
      return {
        content: content || "Desculpe, não consegui completar a tarefa.",
        toolCalls: toolCallCount,
        iterations: i + 1,
      };
    }
  }

  // Fallback: generate final response without tools
  let finalResponse: GroqResponse | null = null;
  try {
    finalResponse = await invokeGroqNonStream({
      model: cfg.model,
      messages: conversationHistory as any,
      maxTokens: cfg.maxTokens,
      temperature: 0.3,
    });
  } catch (groqErr) {
    console.warn("[Chat] Final response Groq failed, trying Gemini fallback...");
    try {
      const geminiContents = convertToGeminiContents(conversationHistory as any);
      const geminiResponse = await invokeGemini({
        contents: geminiContents,
        model: "gemini-2.0-flash",
        maxOutputTokens: cfg.maxTokens,
        temperature: 0.3,
      });
      const text = extractTextFromGeminiResponse(geminiResponse as any);
      finalResponse = {
        id: "gemini-fallback",
        model: "gemini-2.0-flash",
        choices: [{
          index: 0,
          message: { role: "assistant", content: text },
          finish_reason: "stop",
        }],
        usage: { total_tokens: 0 },
      } as any;
    } catch (geminiErr) {
      throw new Error(`Groq: ${(groqErr as Error).message} | Gemini: ${(geminiErr as Error).message}`);
    }
  }

  const finalContent = finalResponse?.choices[0]?.message?.content || "";

  return {
    content: finalContent || "Não consegui completar a tarefa.",
    toolCalls: toolCallCount,
    iterations: cfg.maxIterations,
  };
}

// ─── Task Progress Callback Types ───

export type AgentProgressCallback = {
  onPlanGenerated?: (plan: PlanStep[]) => void;
  onStepStart?: (step: PlanStep) => void;
  onStepComplete?: (step: PlanStep, result: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: string) => void;
  onIteration?: (iteration: number, type: string, content: string) => void;
  onComplete?: (result: AgentResult) => void;
  onError?: (error: Error) => void;
};
