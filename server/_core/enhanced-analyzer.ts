/**
 * Enhanced Binary Analyzer
 * Usa ferramentas do sistema (file, strings, hexdump, unzip) para
 * análise profunda de arquivos binários quando rodando em VM.
 * Fallback para o file-analyzer.ts quando ferramentas não estão disponíveis.
 */

import { execSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { analyzeBinaryFile } from "./file-analyzer.js";

// ─── Types ───

export type EnhancedAnalysis = {
  type: "enhanced" | "fallback";
  fileName: string;
  fileSize: number;
  detectedType: string;
  summary: string;
  details: string;
  rawOutput: string;
};

// ─── Helpers ───

function toolAvailable(tool: string): boolean {
  try {
    execSync(`which ${tool}`, { encoding: "utf-8", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function saveTempFile(buffer: Buffer, ext: string): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "devai-file-"));
  const tmpFile = path.join(tmpDir, `upload.${ext}`);
  await fs.writeFile(tmpFile, buffer);
  return tmpFile;
}

async function cleanup(tmpFile: string) {
  try {
    const dir = path.dirname(tmpFile);
    await fs.rm(dir, { recursive: true, force: true });
  } catch {}
}

// ─── Analysis Functions ───

async function analyzeWithFileCommand(filePath: string): Promise<string> {
  if (!toolAvailable("file")) return "";
  try {
    const result = execSync(`file "${filePath}"`, { encoding: "utf-8", timeout: 10000 });
    return result.trim();
  } catch {
    return "";
  }
}

async function analyzeWithStrings(filePath: string): Promise<string> {
  if (!toolAvailable("strings")) return "";
  try {
    const result = execSync(`strings "${filePath}" | head -100`, { encoding: "utf-8", timeout: 15000 });
    return result;
  } catch {
    return "";
  }
}

async function analyzeWithHexdump(filePath: string): Promise<string> {
  if (!toolAvailable("hexdump")) return "";
  try {
    const result = execSync(`hexdump -C "${filePath}" | head -50`, { encoding: "utf-8", timeout: 10000 });
    return result;
  } catch {
    return "";
  }
}

async function analyzeZipContents(filePath: string): Promise<string> {
  if (!toolAvailable("unzip")) return "";
  try {
    // Listar conteúdo sem extrair
    const result = execSync(`unzip -l "${filePath}" 2>/dev/null | head -200`, { encoding: "utf-8", timeout: 15000 });
    return result;
  } catch {
    return "";
  }
}

async function analyzeWithExiftool(filePath: string): Promise<string> {
  if (!toolAvailable("exiftool")) return "";
  try {
    const result = execSync(`exiftool "${filePath}" 2>/dev/null | head -50`, { encoding: "utf-8", timeout: 10000 });
    return result;
  } catch {
    return "";
  }
}

// ─── Main Enhanced Analysis ───

export async function enhancedAnalyze(buffer: Buffer, fileName: string, fileType: string): Promise<EnhancedAnalysis> {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const fileSize = buffer.length;

  // Primeiro, tentar usar ferramentas do sistema
  const tmpFile = await saveTempFile(buffer, ext);

  try {
    const useSystemTools = toolAvailable("file") || toolAvailable("strings");

    if (useSystemTools) {
      // Análise com ferramentas do sistema
      const fileTypeResult = await analyzeWithFileCommand(tmpFile);
      const stringsResult = await analyzeWithStrings(tmpFile);
      const zipResult = (ext === "zip" || fileType === "application/zip") ? await analyzeZipContents(tmpFile) : "";
      const exifResult = await analyzeWithExiftool(tmpFile);

      // Construir análise detalhada
      let summary = `📁 **Análise Avançada: ${fileName}**\n\n`;
      summary += `**Informações:**\n`;
      summary += `- Tamanho: ${(fileSize / 1024).toFixed(1)} KB\n`;
      summary += `- Tipo MIME: ${fileType || "desconhecido"}\n`;

      if (fileTypeResult) {
        summary += `- Tipo detectado (file): ${fileTypeResult}\n`;
      }

      let details = "";

      if (stringsResult) {
        details += `**Strings extraídas (${stringsResult.split("\n").length} linhas):**\n`;
        details += "```\n";
        // Mostrar as 50 strings mais relevantes
        const lines = stringsResult.split("\n").filter(l => l.trim().length > 0);
        const relevantStrings = lines.filter(l => /[a-zA-Z]{4,}/.test(l));
        for (const str of relevantStrings.slice(0, 50)) {
          details += `  ${str}\n`;
        }
        details += "```\n\n";
      }

      if (zipResult) {
        details += `**Conteúdo do ZIP:**\n`;
        details += "```\n";
        details += zipResult;
        details += "```\n\n";
      }

      if (exifResult) {
        details += `**Metadados:**\n`;
        details += "```\n";
        details += exifResult;
        details += "```\n\n";
      }

      return {
        type: "enhanced",
        fileName,
        fileSize,
        detectedType: fileTypeResult || "desconhecido",
        summary,
        details,
        rawOutput: `${fileTypeResult}\n${stringsResult}\n${zipResult}\n${exifResult}`.slice(0, 10000),
      };
    }
  } finally {
    await cleanup(tmpFile);
  }

  // Fallback para análise em JavaScript puro
  const fallbackAnalysis = analyzeBinaryFile(buffer, fileName, fileType);
  return {
    type: "fallback",
    fileName,
    fileSize,
    detectedType: "js-parsed",
    summary: fallbackAnalysis,
    details: "",
    rawOutput: fallbackAnalysis,
  };
}

// ─── Export all tools available ───

export function getAvailableTools(): string[] {
  const tools = ["file", "strings", "hexdump", "unzip", "exiftool", "objdump", "readelf"];
  return tools.filter(toolAvailable);
}
