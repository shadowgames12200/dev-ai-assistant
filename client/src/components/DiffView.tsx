/**
 * DiffView Component — Visualização de Diffs estilo GitHub PR
 * 
 * Exibe mudanças lado a lado com linhas verdes (adicionadas) e vermelhas (removidas).
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, FileCode, Plus, Minus } from "lucide-react";

export type DiffLine = {
  type: "add" | "remove" | "context";
  content: string;
  lineNum?: number;
};

export type FileDiff = {
  filePath: string;
  diffLines: DiffLine[];
  additions: number;
  deletions: number;
  isCreate: boolean;
};

function DiffFileBlock({ diff }: { diff: FileDiff }) {
  const [collapsed, setCollapsed] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      {/* Header do arquivo */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <FileCode className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-mono font-medium text-foreground truncate flex-1 text-left">
          {diff.filePath}
        </span>
        {diff.isCreate && (
          <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">NOVO</span>
        )}
        <span className="text-[10px] text-green-500 font-medium">+{diff.additions}</span>
        <span className="text-[10px] text-red-500 font-medium">-{diff.deletions}</span>
      </button>

      {!collapsed && (
        <>
          {/* Toggle diff view */}
          <div className="flex items-center justify-between px-3 py-1 border-t border-border/30">
            <span className="text-[10px] text-muted-foreground">
              {diff.additions + diff.deletions} linha{diff.additions + diff.deletions !== 1 ? "s" : ""} alterada{diff.additions + diff.deletions !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => setShowDiff(!showDiff)}
              className="text-[10px] text-primary hover:underline"
            >
              {showDiff ? "Ver resumo" : "Ver diff completo"}
            </button>
          </div>

          {showDiff ? (
            /* Diff view */
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full border-collapse text-[11px] font-mono">
                <tbody>
                  {diff.diffLines.map((line, i) => (
                    <tr
                      key={i}
                      className={
                        line.type === "add"
                          ? "bg-green-500/10"
                          : line.type === "remove"
                          ? "bg-red-500/10"
                          : ""
                      }
                    >
                      <td className="px-2 py-0 text-muted-foreground text-right w-10 select-none">
                        {line.lineNum || ""}
                      </td>
                      <td className="px-1 text-muted-foreground select-none w-4">
                        {line.type === "add" ? (
                          <Plus className="h-3 w-3 text-green-500" />
                        ) : line.type === "remove" ? (
                          <Minus className="h-3 w-3 text-red-500" />
                        ) : (
                          <span className="text-muted-foreground/30"> </span>
                        )}
                      </td>
                      <td className="px-2 py-0 whitespace-pre">{line.content || " "}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Resumo */
            <div className="px-3 py-2 space-y-1">
              {diff.diffLines
                .filter((l) => l.type !== "context")
                .slice(0, 20)
                .map((line, i) => (
                  <div
                    key={i}
                    className={`text-[10px] font-mono ${
                      line.type === "add"
                        ? "text-green-400"
                        : line.type === "remove"
                        ? "text-red-400"
                        : ""
                    }`}
                  >
                    {line.type === "add" ? "+ " : line.type === "remove" ? "- " : "  "}
                    {line.content}
                  </div>
                ))}
              {diff.diffLines.filter((l) => l.type !== "context").length > 20 && (
                <p className="text-[10px] text-muted-foreground">
                  ...e mais {diff.diffLines.filter((l) => l.type !== "context").length - 20} linhas
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function DiffView({ diffs }: { diffs: FileDiff[] }) {
  if (diffs.length === 0) return null;

  const totalAdditions = diffs.reduce((acc, d) => acc + d.additions, 0);
  const totalDeletions = diffs.reduce((acc, d) => acc + d.deletions, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <FileCode className="h-4 w-4 text-primary" />
        <h3 className="text-xs font-semibold text-foreground">
          Review de Código
        </h3>
        <span className="text-[10px] text-muted-foreground">
          ({diffs.length} arquivo{diffs.length !== 1 ? "s" : ""}, +{totalAdditions}/-{totalDeletions})
        </span>
      </div>
      {diffs.map((diff, i) => (
        <DiffFileBlock key={i} diff={diff} />
      ))}
    </div>
  );
}
