/**
 * Deep Reasoning Module
 * Implementa raciocínio profundo similar ao o1/o3 usando DeepSeek-R1
 * Permite que a IA "pense" antes de responder problemas complexos
 */

import { ENV } from "./env.js";

export interface ReasoningThought {
  step: number;
  thinking: string;
  confidence: number;
}

export interface DeepReasoningResponse {
  thinking: ReasoningThought[];
  finalAnswer: string;
  totalThinkingTime: number;
  complexity: "simple" | "moderate" | "complex" | "very_complex";
}

class DeepReasoningEngine {
  private baseUrl: string;
  private model: string = "deepseek-reasoner"; // ou deepseek-chat para fallback

  constructor() {
    // Usar Groq com suporte a DeepSeek se disponível
    this.baseUrl = process.env.GROQ_API_BASE || "https://api.groq.com/openai/v1";
  }

  /**
   * Analisa a complexidade de uma pergunta
   */
  private analyzeComplexity(question: string): "simple" | "moderate" | "complex" | "very_complex" {
    const wordCount = question.split(" ").length;
    const hasLogic = /if|then|because|therefore|implies|logic|reason|why|how/i.test(question);
    const hasMath = /\d+|calculate|solve|equation|formula|math|compute/i.test(question);
    const hasMultipart = /and|or|also|additionally|furthermore/i.test(question);

    if (wordCount < 10 && !hasLogic && !hasMath) return "simple";
    if (wordCount < 30 && (hasLogic || hasMath) && !hasMultipart) return "moderate";
    if (hasMultipart || (hasLogic && hasMath)) return "complex";
    return "very_complex";
  }

  /**
   * Extrai o processo de pensamento da resposta
   */
  private extractThinking(response: string): ReasoningThought[] {
    const thoughts: ReasoningThought[] = [];
    const lines = response.split("\n");

    let currentStep = 0;
    let currentThinking = "";

    for (const line of lines) {
      if (line.match(/^Step \d+:|^Passo \d+:|^\d+\./)) {
        if (currentThinking) {
          thoughts.push({
            step: currentStep,
            thinking: currentThinking.trim(),
            confidence: 0.8,
          });
          currentStep++;
        }
        currentThinking = line;
      } else if (line.trim()) {
        currentThinking += "\n" + line;
      }
    }

    if (currentThinking) {
      thoughts.push({
        step: currentStep,
        thinking: currentThinking.trim(),
        confidence: 0.8,
      });
    }

    return thoughts.length > 0 ? thoughts : [{ step: 1, thinking: response, confidence: 0.7 }];
  }

  /**
   * Realiza raciocínio profundo sobre uma pergunta
   */
  async reasonAbout(
    question: string,
    context?: string
  ): Promise<DeepReasoningResponse> {
    const complexity = this.analyzeComplexity(question);
    const startTime = Date.now();

    // Ajustar o prompt baseado na complexidade
    const systemPrompt = this.buildSystemPrompt(complexity);
    const userPrompt = this.buildUserPrompt(question, context, complexity);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${ENV.groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "mixtral-8x7b-32768", // DeepSeek não está em Groq ainda, usar Mixtral como fallback
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: complexity === "very_complex" ? 4096 : 2048,
          top_p: 0.95,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      const responseText = data.choices[0]?.message?.content || "";
      const thinking = this.extractThinking(responseText);

      // Extrair a resposta final (última parte após "Resposta Final:" ou similar)
      const finalAnswerMatch = responseText.match(
        /(?:Resposta Final:|Final Answer:|Conclusão:)\s*([\s\S]*?)$/i
      );
      const finalAnswer = finalAnswerMatch ? finalAnswerMatch[1].trim() : responseText;

      return {
        thinking,
        finalAnswer,
        totalThinkingTime: Date.now() - startTime,
        complexity,
      };
    } catch (err) {
      console.error("[DeepReasoning] Erro:", err);
      throw err;
    }
  }

  /**
   * Constrói o prompt do sistema baseado na complexidade
   */
  private buildSystemPrompt(complexity: string): string {
    const basePrompt = `Você é um sistema de raciocínio profundo inspirado no o1 da OpenAI.
Sua tarefa é pensar profundamente sobre problemas antes de responder.

Instruções:
1. SEMPRE mostre seu processo de pensamento passo a passo
2. Identifique suposições e possíveis erros
3. Considere múltiplas perspectivas
4. Verifique sua lógica
5. Forneça uma resposta final clara

Formato de resposta:
- Comece com "Pensamento:" e mostre seu raciocínio
- Use "Passo 1:", "Passo 2:", etc. para estruturar
- Termine com "Resposta Final:" seguido da resposta`;

    if (complexity === "very_complex") {
      return (
        basePrompt +
        `

IMPORTANTE: Este é um problema MUITO complexo.
- Considere casos extremos
- Verifique sua resposta múltiplas vezes
- Se encontrar contradições, explore-as
- Seja extremamente cuidadoso com a lógica`
      );
    }

    return basePrompt;
  }

  /**
   * Constrói o prompt do usuário
   */
  private buildUserPrompt(question: string, context: string | undefined, complexity: string): string {
    let prompt = question;

    if (context) {
      prompt += `\n\nContexto:\n${context}`;
    }

    if (complexity === "very_complex") {
      prompt += `\n\nNota: Pense profundamente sobre este problema. Não tenha pressa.`;
    }

    return prompt;
  }

  /**
   * Formata a resposta para exibição
   */
  formatResponse(response: DeepReasoningResponse): string {
    let output = `## 🧠 Raciocínio Profundo (${response.complexity})\n\n`;

    output += `### Processo de Pensamento\n`;
    for (const thought of response.thinking) {
      output += `**Passo ${thought.step}** (Confiança: ${(thought.confidence * 100).toFixed(0)}%)\n`;
      output += `${thought.thinking}\n\n`;
    }

    output += `### Resposta Final\n${response.finalAnswer}\n\n`;
    output += `⏱️ Tempo de raciocínio: ${response.totalThinkingTime}ms`;

    return output;
  }
}

export const deepReasoningEngine = new DeepReasoningEngine();

/**
 * Wrapper para usar raciocínio profundo
 */
export async function invokeDeepReasoning(
  question: string,
  context?: string
): Promise<DeepReasoningResponse> {
  return await deepReasoningEngine.reasonAbout(question, context);
}
