/**
 * Structured Response Module — Respostas Estruturadas
 * 
 * Processa e formata as respostas da IA para garantir consistência
 * e qualidade visual na interface.
 * 
 * Funcionalidades:
 * - Formatação automática de Markdown
 * - Detecção de tipo de conteúdo (código, tabela, lista, etc.)
 * - Stream-friendly output
 * - Error handling elegante
 */

// ─── Types ───

export type ResponseType = 
  | "text" 
  | "code" 
  | "tutorial" 
  | "analysis" 
  | "list" 
  | "table" 
  | "mixed"
  | "error"
  | "tool_result";

export type FormattedResponse = {
  type: ResponseType;
  content: string;
  codeBlocks: CodeBlock[];
  hasTables: boolean;
  hasImages: boolean;
  wordCount: number;
  estimatedReadTime: string;
  language: string;
  structure: ResponseStructure;
};

export type CodeBlock = {
  language: string;
  code: string;
  filename?: string;
  lineCount: number;
};

export type ResponseStructure = {
  hasTitle: boolean;
  hasSubtitles: boolean;
  hasLists: boolean;
  hasBold: boolean;
  hasCode: boolean;
  hasTables: boolean;
  hasLinks: boolean;
  depth: number;
};

// ─── Analyze Response Type ───

export function analyzeResponseType(content: string): ResponseType {
  const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).length;
  const tables = (content.match(/\|[\s\S]*?\|/g) || []).length;
  const lists = (content.match(/^[-*]\s/mg) || []).length + (content.match(/^\d+\.\s/mg) || []).length;
  const hasImages = /!\[.*?\]\(.*?\)/.test(content);

  if (codeBlocks >= 3 && codeBlocks > lists) return "code";
  if (codeBlocks >= 2) return "mixed";
  if (tables > 2) return "table";
  if (lists >= 5) return "list";
  if (/^(#|##)\s/m.test(content) && /^(###)/m.test(content)) return "tutorial";
  if (content.length > 500 && (lists > 0 || codeBlocks > 0)) return "analysis";
  if (hasImages) return "mixed";
  return "text";
}

// ─── Extract Code Blocks ───

export function extractCodeBlocks(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const regex = /```(\w+)?(?:\s+filename=["']?([^"'\n]+)["']?)?\n([\s\S]*?)```/g;
  
  let match;
  while ((match = regex.exec(content)) !== null) {
    const language = match[1] || "text";
    const filename = match[2];
    const code = match[3].trim();
    blocks.push({
      language,
      code,
      filename,
      lineCount: code.split("\n").length,
    });
  }

  return blocks;
}

// ─── Analyze Structure ───

export function analyzeStructure(content: string): ResponseStructure {
  return {
    hasTitle: /^#\s/m.test(content),
    hasSubtitles: /^##\s|^###\s/m.test(content),
    hasLists: /^[-*]\s/m.test(content) || /^\d+\.\s/m.test(content),
    hasBold: /\*\*.*?\*\*/.test(content),
    hasCode: /`[^`]+`/.test(content) || /```\s*/.test(content),
    hasTables: /^\|/m.test(content),
    hasLinks: /\[.*?\]\(.*?\)/.test(content),
    depth: (content.match(/^##/gm) || []).length + (content.match(/^###/gm) || []).length,
  };
}

// ─── Format Full Response ───

export function formatResponse(content: string, responseType?: ResponseType): FormattedResponse {
  const type = responseType || analyzeResponseType(content);
  const codeBlocks = extractCodeBlocks(content);
  const structure = analyzeStructure(content);
  const wordCount = content.split(/\s+/).length;
  const hasTables = /^\|/m.test(content);
  const hasImages = /!\[.*?\]\(.*?\)/.test(content);

  // Estimate read time (average 200 words per minute)
  const minutes = Math.max(1, Math.ceil(wordCount / 200));
  const estimatedReadTime = minutes === 1 ? "1 min de leitura" : `${minutes} min de leitura`;

  // Detect primary language from code blocks
  const languageCounts: Record<string, number> = {};
  for (const block of codeBlocks) {
    languageCounts[block.language] = (languageCounts[block.language] || 0) + 1;
  }
  const primaryLanguage = Object.entries(languageCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "text";

  return {
    type,
    content,
    codeBlocks,
    hasTables,
    hasImages,
    wordCount,
    estimatedReadTime,
    language: primaryLanguage,
    structure,
  };
}

// ─── Response Quality Check ───

export type QualityIssue = {
  type: "incomplete" | "short" | "no_structure" | "no_code";
  severity: "warning" | "error";
  message: string;
};

export function checkResponseQuality(
  content: string,
  originalRequest: string
): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Check if response is too short for a complex request
  if (originalRequest.length > 100 && content.length < 200) {
    issues.push({
      type: "short",
      severity: "warning",
      message: "A resposta pode ser muito curta para a complexidade do pedido.",
    });
  }

  // Check for incomplete responses (trailing ellipsis)
  if (content.trim().endsWith("...") || content.trim().endsWith("…")) {
    issues.push({
      type: "incomplete",
      severity: "warning",
      message: "A resposta parece estar incompleta (termina com reticências).",
    });
  }

  // Check if code was requested but not provided
  const requestsCode = /c(?:ri[ae]|onstru)[^\.]*c[óo]digo|script|programa|fun[cç][aã]o|classe|implemente/i.test(originalRequest);
  if (requestsCode && !content.includes("```")) {
    issues.push({
      type: "no_code",
      severity: "warning",
      message: "O usuário pediu código, mas a resposta não contém blocos de código.",
    });
  }

  // Check structure quality
  if (content.length > 300 && !/\*\*/.test(content) && !content.includes("#")) {
    issues.push({
      type: "no_structure",
      severity: "warning",
      message: "A resposta longa não usa formatação Markdown para melhor legibilidade.",
    });
  }

  return issues;
}

// ─── Post-Processing ───

/**
 * Post-process AI response to ensure quality
 */
export function postProcessResponse(
  content: string,
  issues: QualityIssue[]
): string {
  if (issues.length === 0) return content;

  let processed = content;

  for (const issue of issues) {
    switch (issue.type) {
      // Notas automáticas removidas para manter a limpeza da resposta (Estilo J.A.R.V.I.S.)
      case "incomplete":
        break;
      case "no_structure":
        break;
      case "no_code":
        break;
      case "short":
        break;
    }
  }

  return processed;
}

// ─── Streaming Support ───

export type StreamChunk = {
  type: "text" | "code_start" | "code_end" | "table_start" | "table_end";
  content: string;
  metadata?: Record<string, unknown>;
};

/**
 * Simple streaming parser that detects markdown elements in real-time
 */
export function createStreamingParser() {
  let buffer = "";
  let inCodeBlock = false;
  let codeLanguage = "";
  let codeBuffer = "";

  return {
    process(chunk: string): StreamChunk[] {
      buffer += chunk;
      const chunks: StreamChunk[] = [];

      // Detect code block start
      if (!inCodeBlock && buffer.includes("```")) {
        const backtickIdx = buffer.lastIndexOf("```");
        if (backtickIdx !== -1) {
          const beforeBacktick = buffer.slice(0, backtickIdx);
          const afterBacktick = buffer.slice(backtickIdx + 3);
          const langMatch = afterBacktick.match(/^(\w+)/);
          
          if (beforeBacktick) {
            chunks.push({ type: "text", content: beforeBacktick });
          }

          if (langMatch) {
            codeLanguage = langMatch[1];
            codeBuffer = afterBacktick.slice(langMatch[1].length);
          } else {
            codeLanguage = "text";
            codeBuffer = afterBacktick;
          }

          inCodeBlock = true;
          chunks.push({
            type: "code_start",
            content: "",
            metadata: { language: codeLanguage },
          });

          // Reset buffer to remaining content
          buffer = "";
        }
      }

      // Detect code block end
      if (inCodeBlock && buffer.includes("```")) {
        const backtickIdx = buffer.indexOf("```");
        codeBuffer += buffer.slice(0, backtickIdx);
        buffer = buffer.slice(backtickIdx + 3);
        inCodeBlock = false;

        chunks.push({ type: "code_end", content: codeBuffer });
        codeBuffer = "";
        codeLanguage = "";
      }

      // Normal text
      if (!inCodeBlock && buffer.length > 0) {
        chunks.push({ type: "text", content: buffer });
        buffer = "";
      }

      return chunks;
    },

    flush(): StreamChunk[] {
      const chunks: StreamChunk[] = [];
      if (buffer) {
        if (inCodeBlock) {
          chunks.push({ type: "code_end", content: codeBuffer + buffer });
        } else {
          chunks.push({ type: "text", content: buffer });
        }
      }
      buffer = "";
      inCodeBlock = false;
      codeBuffer = "";
      return chunks;
    },
  };
}
