/**
 * Diff Generator Module — Geração de Diffs Unificados
 * 
 * Gera diffs estilo GitHub PR para revisão de código antes de aprovar auto-melhorias.
 * Compara o conteúdo atual do arquivo com o conteúdo proposto.
 */

import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

// ─── Types ───

export type DiffLine = {
  type: "add" | "remove" | "context";
  content: string;
  lineNum?: number;
};

export type FileDiff = {
  filePath: string;
  oldContent: string;
  newContent: string;
  diffLines: DiffLine[];
  additions: number;
  deletions: number;
  isCreate: boolean; // true se arquivo novo
};

export type ProposalDiff = {
  proposalId: string;
  files: FileDiff[];
  totalAdditions: number;
  totalDeletions: number;
};

// ─── Diff Algorithm (Myers-ish simplified) ───

function splitLines(content: string): string[] {
  return content.split("\n");
}

/**
 * Gera um diff unificado simples entre duas strings.
 */
function computeDiff(oldContent: string, newContent: string): FileDiff {
  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);
  
  const diffLines: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;
  
  // Diff simples por linha (não otimizado, mas funcional para review)
  // Para arquivos grandes, usaríamos Myers diff, mas para review de código isso basta
  
  let oldIdx = 0;
  let newIdx = 0;
  
  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (oldIdx < oldLines.length && newIdx < newLines.length) {
      if (oldLines[oldIdx] === newLines[newIdx]) {
        // Linha inalterada (contexto)
        diffLines.push({ type: "context", content: oldLines[oldIdx], lineNum: oldIdx + 1 });
        oldIdx++;
        newIdx++;
      } else {
        // Mudança: remove antiga, adiciona nova
        diffLines.push({ type: "remove", content: oldLines[oldIdx], lineNum: oldIdx + 1 });
        deletions++;
        diffLines.push({ type: "add", content: newLines[newIdx], lineNum: newIdx + 1 });
        additions++;
        oldIdx++;
        newIdx++;
      }
    } else if (oldIdx < oldLines.length) {
      // Restante do old = deletado
      diffLines.push({ type: "remove", content: oldLines[oldIdx], lineNum: oldIdx + 1 });
      deletions++;
      oldIdx++;
    } else {
      // Restante do new = adicionado
      diffLines.push({ type: "add", content: newLines[newIdx], lineNum: newIdx + 1 });
      additions++;
      newIdx++;
    }
  }
  
  return {
    filePath: "",
    oldContent,
    newContent,
    diffLines,
    additions,
    deletions,
    isCreate: oldContent === "",
  };
}

/**
 * Gera diffs para todos os arquivos de uma proposta.
 */
export async function generateProposalDiff(
  proposalId: string,
  changes: Array<{ file: string; content: string }>
): Promise<ProposalDiff> {
  const files: FileDiff[] = [];
  let totalAdditions = 0;
  let totalDeletions = 0;
  
  // Criar diretório temporário para clonar o repo e comparar
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "devai-diff-"));
  const cloneDir = path.join(tmpDir, "repo");
  
  try {
    // Clonar o repo para obter os arquivos atuais
    const gitResult = execShell(`git clone https://github.com/shadowgames12200/dev-ai-assistant.git ${cloneDir}`, tmpDir);
    
    if (gitResult.exitCode !== 0) {
      // Fallback: gerar diffs apenas com conteúdo novo (considerar como criação)
      for (const change of changes) {
        const diff = computeDiff("", change.content);
        diff.filePath = change.file;
        diff.isCreate = true;
        files.push(diff);
        totalAdditions += diff.additions;
        totalDeletions += diff.deletions;
      }
      
      return { proposalId, files, totalAdditions, totalDeletions };
    }
    
    // Gerar diff para cada arquivo
    for (const change of changes) {
      const filePath = path.join(cloneDir, change.file);
      let oldContent = "";
      let isNew = true;
      
      try {
        oldContent = await fs.readFile(filePath, "utf-8");
        isNew = false;
      } catch {
        // Arquivo não existe no repo = criação
        oldContent = "";
        isNew = true;
      }
      
      const diff = computeDiff(oldContent, change.content);
      diff.filePath = change.file;
      diff.isCreate = isNew;
      files.push(diff);
      totalAdditions += diff.additions;
      totalDeletions += diff.deletions;
    }
    
    return { proposalId, files, totalAdditions, totalDeletions };
  } finally {
    // Limpar diretório temporário
    try {
      execShell(`rm -rf "${tmpDir}"`, tmpDir);
    } catch {}
  }
}

/**
 * Formata um diff em formato legível (estilo GitHub).
 */
export function formatDiffAsText(fileDiff: FileDiff): string {
  const header = fileDiff.isCreate
    ? `--- /dev/null\n+++ b/${fileDiff.filePath}`
    : `--- a/${fileDiff.filePath}\n+++ b/${fileDiff.filePath}`;
  
  const lines = fileDiff.diffLines.map(line => {
    switch (line.type) {
      case "add": return `+${line.content}`;
      case "remove": return `-${line.content}`;
      case "context": return ` ${line.content}`;
    }
  });
  
  return [header, ...lines].join("\n");
}

/**
 * Gera um HTML preview do diff para exibição no frontend.
 */
export function generateDiffHTML(fileDiffs: FileDiff[]): string {
  const rows = fileDiffs.flatMap(diff => {
    const header = `<tr class="bg-muted/50"><td colspan="3" class="px-3 py-1 text-xs font-mono font-semibold text-primary">${diff.isCreate ? "📄 NOVO: " : ""}${diff.filePath} <span class="text-muted-foreground">(+${diff.additions}/-${diff.deletions})</span></td></tr>`;
    
    const contentRows = diff.diffLines.map(line => {
      let bgClass = "";
      let prefix = "";
      switch (line.type) {
        case "add":
          bgClass = "bg-green-500/10";
          prefix = "+";
          break;
        case "remove":
          bgClass = "bg-red-500/10";
          prefix = "-";
          break;
        case "context":
          bgClass = "";
          prefix = " ";
      }
      
      return `<tr class="${bgClass}"><td class="px-2 py-0.5 text-[10px] text-muted-foreground text-right font-mono">${line.lineNum || ""}</td><td class="px-1 text-[10px] text-muted-foreground font-mono select-none">${prefix}</td><td class="px-2 py-0.5 text-xs font-mono whitespace-pre">${escapeHtml(line.content)}</td></tr>`;
    });
    
    return [header, ...contentRows];
  });
  
  return `<table class="w-full border-collapse">${rows.join("")}</table>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function execShell(command: string, cwd?: string, timeout: number = 60000): { stdout: string; stderr: string; exitCode: number } {
  try {
    const result = execSync(command, {
      cwd: cwd || os.tmpdir(),
      encoding: "utf-8",
      timeout,
      env: { ...process.env },
      maxBuffer: 5 * 1024 * 1024,
    });
    return { stdout: result, stderr: "", exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout || "",
      stderr: err.stderr || err.message || "",
      exitCode: err.status || 1,
    };
  }
}
