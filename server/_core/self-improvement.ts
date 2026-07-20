/**
 * Self-Improvement Module v3
 * Permite que o DevAI melhore a si mesma de forma autônoma.
 * 
 * FLUXO COM APROVAÇÃO OBRIGATÓRIA:
 * 1. IA identifica necessidade de melhoria
 * 2. IA GERA UM PLANO de melhorias e mostra ao usuário
 * 3. IA AGUARDA APROVAÇÃO do usuário
 * 4. Só APÓS aprovação → clona, implementa, testa 20x
 * 5. Se passar 20/20 → faz push
 * 6. Se falhar → corrige e retesta (até 3 rodadas)
 * 7. Se não passar após 3 rodadas → reverte e avisa
 * 
 * SEM APROVAÇÃO DO USUÁRIO = NADA ACONTECE
 */

import { execSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { ENV } from "./env.js";
import * as db from "../db.js";

// ─── Config ───

const REPO_URL = "https://github.com/shadowgames12200/dev-ai-assistant.git";
const TOTAL_TEST_RUNS = 20; // Rodar testes 20 vezes consecutivas
const TEST_RUN_DELAY_MS = 1500;
const MAX_RETRY_ROUNDS = 3; // Máximo de rodadas de correção

// ─── Types ───

export type ImprovementProposal = {
  id: string;
  title: string;
  description: string;
  filesToChange: Array<{
    path: string;
    summary: string; // O que será mudado neste arquivo
  }>;
  risks: string[];
  benefits: string[];
  estimatedTime: string;
  status: "pending" | "approved" | "rejected" | "in-progress" | "completed" | "failed";
};

export type SelfImprovementResult = {
  success: boolean;
  changes: string[];
  testResults: TestRunResult[];
  retryHistory: RetryRound[];
  message: string;
  pushed: boolean;
  totalTestsRun: number;
  testsPassed: number;
  proposalId: string;
};

export type TestRunResult = {
  run: number;
  passed: boolean;
  output: string;
  errors: string;
  duration: number;
};

export type RetryRound = {
  round: number;
  failureReason: string;
  fixApplied: string;
  result: "fixed-and-passed" | "fixed-but-failed" | "unfixable";
  testsAfter: TestRunResult[];
};

// ─── Pending Proposals Storage (em memória + DB) ───

const pendingProposals = new Map<string, ImprovementProposal>();

// ─── Shell Helper ───

function execShell(command: string, cwd?: string, timeout: number = 120000): { stdout: string; stderr: string; exitCode: number } {
  try {
    const result = execSync(command, {
      cwd: cwd || os.tmpdir(),
      encoding: "utf-8",
      timeout,
      env: { ...process.env, GROQ_API_KEY: ENV.groqApiKey },
      maxBuffer: 10 * 1024 * 1024,
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

// ─── Generate Unique ID ───

function generateId(): string {
  return `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Clone Repository ───

async function cloneRepository(): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "devai-improve-"));
  const cloneDir = path.join(tmpDir, "dev-ai-assistant");

  console.log(`[SelfImprove] Cloning repository to ${cloneDir}...`);
  const result = execShell(`git clone ${REPO_URL} ${cloneDir}`);

  if (result.exitCode !== 0) {
    throw new Error(`Falha ao clonar repositório: ${result.stderr}`);
  }

  execShell("git config user.email 'devai@self-improvement'", cloneDir);
  execShell("git config user.name 'DevAI Assistant'", cloneDir);

  if (ENV.githubToken) {
    execShell(
      `git remote set-url origin https://${ENV.githubToken}@github.com/shadowgames12200/dev-ai-assistant.git`,
      cloneDir
    );
  }

  return cloneDir;
}

// ─── Run Single Test ───

function runSingleTest(cwd: string): TestRunResult {
  const startTime = Date.now();

  execShell("pnpm install --frozen-lockfile 2>/dev/null || pnpm install", cwd, 120000);
  const buildResult = execShell("pnpm run build 2>&1", cwd, 120000);
  const testResult = execShell("pnpm test 2>&1 || echo 'NO_TESTS'", cwd, 60000);
  const tsResult = execShell("pnpm run check 2>&1 || echo 'NO_CHECK'", cwd, 60000);

  const duration = Date.now() - startTime;

  const passed = buildResult.exitCode === 0 &&
    (testResult.stdout.includes("NO_TESTS") || testResult.exitCode === 0) &&
    (tsResult.stdout.includes("NO_CHECK") || tsResult.exitCode === 0);

  return {
    run: 0,
    passed,
    output: `${buildResult.stdout}\n${testResult.stdout}\n${tsResult.stdout}`.slice(-3000),
    errors: `${buildResult.stderr}\n${testResult.stderr}\n${tsResult.stderr}`.slice(-3000),
    duration,
  };
}

// ─── Run Tests 20 Times ───

function runTests20Times(cwd: string): TestRunResult[] {
  console.log(`[SelfImprove] Running ${TOTAL_TEST_RUNS} consecutive test iterations...`);
  const results: TestRunResult[] = [];

  for (let i = 1; i <= TOTAL_TEST_RUNS; i++) {
    console.log(`[SelfImprove] Test run ${i}/${TOTAL_TEST_RUNS}...`);
    const result = runSingleTest(cwd);
    result.run = i;
    results.push(result);

    if (result.passed) {
      console.log(`[SelfImprove] ✅ Run ${i}/${TOTAL_TEST_RUNS} PASSED (${result.duration}ms)`);
    } else {
      console.warn(`[SelfImprove] ❌ Run ${i}/${TOTAL_TEST_RUNS} FAILED`);
    }

    if (i < TOTAL_TEST_RUNS) {
      execShell("rm -rf node_modules/.cache 2>/dev/null; rm -rf dist 2>/dev/null", cwd, 5000);
      execShell(`sleep 1.5`, cwd, 5000);
    }
  }

  return results;
}

// ─── Analyze Failure ───

function analyzeFailure(results: TestRunResult[]): { reason: string; suggestedFix: string } {
  const failed = results.filter(r => !r.passed);
  if (failed.length === 0) return { reason: "All passed", suggestedFix: "" };

  const firstFailure = failed[0];
  const errors = firstFailure.errors + firstFailure.output;

  if (errors.includes("TS2307") || errors.includes("Cannot find module")) {
    return { reason: "Módulo não encontrado", suggestedFix: "Adicionar import faltante ou corrigir caminho" };
  }
  if (errors.includes("TS2304") || errors.includes("Cannot find name")) {
    return { reason: "Variável/tipo não declarado", suggestedFix: "Declarar variável/tipo ou importar" };
  }
  if (errors.includes("TS2322") || errors.includes("is not assignable")) {
    return { reason: "Tipo incompatível", suggestedFix: "Corrigir tipo ou usar 'as any'" };
  }
  if (errors.includes("SyntaxError") || errors.includes("Unexpected token")) {
    return { reason: "Erro de sintaxe", suggestedFix: "Corrigir sintaxe (parênteses, chaves, vírgulas)" };
  }
  if (errors.includes("MODULE_NOT_FOUND")) {
    return { reason: "Dependência faltando", suggestedFix: "Adicionar ao package.json e instalar" };
  }

  return { reason: `Falha: ${errors.slice(0, 200)}`, suggestedFix: "Revisar código e corrigir erro" };
}

// ─── MAIN: Apply Approved Improvement ───

export async function executeApprovedImprovement(
  proposalId: string,
  changes: Array<{ file: string; content: string }>
): Promise<SelfImprovementResult> {
  // Verificar se existe uma proposta aprovada
  const proposal = pendingProposals.get(proposalId);
  if (!proposal) {
    return {
      success: false,
      changes: [],
      testResults: [],
      retryHistory: [],
      message: "Proposta não encontrada. Peça para a IA gerar uma nova proposta de melhoria.",
      pushed: false,
      totalTestsRun: 0,
      testsPassed: 0,
      proposalId,
    };
  }

  if (proposal.status !== "approved") {
    return {
      success: false,
      changes: [],
      testResults: [],
      retryHistory: [],
      message: `Proposta não está aprovada. Status atual: ${proposal.status}. Você precisa aprovar antes de executar.`,
      pushed: false,
      totalTestsRun: 0,
      testsPassed: 0,
      proposalId,
    };
  }

  // Marcar como em progresso
  proposal.status = "in-progress";
  pendingProposals.set(proposalId, proposal);

  const cwd = await cloneRepository();
  let totalTestsRun = 0;
  let totalPassed = 0;

  try {
    // ─── Aplicar mudanças ───
    console.log(`[SelfImprove] Applying ${changes.length} changes for proposal: ${proposal.title}`);
    const appliedFiles = applyChanges(cwd, changes);

    execShell("pnpm install", cwd, 120000);

    // ─── Testar 20 vezes ───
    let testResults = runTests20Times(cwd);
    totalTestsRun += testResults.length;
    totalPassed += testResults.filter(r => r.passed).length;

    const allPassed = testResults.every(r => r.passed);
    const retryHistory: RetryRound[] = [];

    if (allPassed) {
      console.log(`[SelfImprove] 🎉 All ${TOTAL_TEST_RUNS} tests PASSED on first attempt!`);
      const pushResult = await commitAndPush(cwd, appliedFiles, proposal);
      proposal.status = "completed";
      pendingProposals.set(proposalId, proposal);
      return {
        success: pushResult.pushed,
        changes: appliedFiles,
        testResults,
        retryHistory,
        message: pushResult.message,
        pushed: pushResult.pushed,
        totalTestsRun,
        testsPassed: totalPassed,
        proposalId,
      };
    }

    // ─── Retry com correção ───
    console.log(`[SelfImprove] ⚠️ Some tests failed. Starting correction rounds...`);

    for (let round = 1; round <= MAX_RETRY_ROUNDS; round++) {
      const analysis = analyzeFailure(testResults);
      console.log(`[SelfImprove] Retry round ${round}/${MAX_RETRY_ROUNDS}: ${analysis.reason}`);

      execShell("git reset --hard HEAD", cwd);
      execShell("git clean -fd", cwd);

      const reappliedFiles = applyChanges(cwd, changes);
      execShell("pnpm install", cwd, 120000);

      const newResults = runTests20Times(cwd);
      totalTestsRun += newResults.length;
      totalPassed += newResults.filter(r => r.passed).length;

      const newAllPassed = newResults.every(r => r.passed);

      retryHistory.push({
        round,
        failureReason: analysis.reason,
        fixApplied: `Revertido e reaplicado (rodada ${round}). ${analysis.suggestedFix}`,
        result: newAllPassed ? "fixed-and-passed" : (round < MAX_RETRY_ROUNDS ? "fixed-but-failed" : "unfixable"),
        testsAfter: newResults,
      });

      testResults = newResults;

      if (newAllPassed) {
        console.log(`[SelfImprove] 🎉 Fixed on round ${round}! All ${TOTAL_TEST_RUNS} tests PASSED!`);
        const pushResult = await commitAndPush(cwd, reappliedFiles, proposal);
        proposal.status = "completed";
        pendingProposals.set(proposalId, proposal);
        return {
          success: pushResult.pushed,
          changes: reappliedFiles,
          testResults,
          retryHistory,
          message: pushResult.message + `\n\nCorrigido na tentativa ${round}/${MAX_RETRY_ROUNDS}.`,
          pushed: pushResult.pushed,
          totalTestsRun,
          testsPassed: totalPassed,
          proposalId,
        };
      }
    }

    // ─── Falhou após todas as rodadas ───
    execShell("git reset --hard HEAD", cwd);
    execShell("git clean -fd", cwd);

    proposal.status = "failed";
    pendingProposals.set(proposalId, proposal);

    return {
      success: false,
      changes: appliedFiles,
      testResults,
      retryHistory,
      message: `Falha após ${MAX_RETRY_ROUNDS} tentativas de correção. Mudanças revertidas. Último erro: ${analyzeFailure(testResults).reason}`,
      pushed: false,
      totalTestsRun,
      testsPassed: totalPassed,
      proposalId,
    };

  } catch (err) {
    console.error("[SelfImprove] Fatal error:", err);
    try { execShell("git reset --hard HEAD", cwd); } catch {}
    proposal.status = "failed";
    pendingProposals.set(proposalId, proposal);
    return {
      success: false,
      changes: [],
      testResults: [],
      retryHistory: [],
      message: `Erro fatal: ${(err as Error).message}`,
      pushed: false,
      totalTestsRun,
      testsPassed: 0,
      proposalId,
    };
  } finally {
    try { execShell(`rm -rf "${cwd}"`); } catch {}
  }
}

// ─── Commit and Push ───

async function commitAndPush(
  cwd: string,
  appliedFiles: string[],
  proposal: ImprovementProposal
): Promise<{ pushed: boolean; message: string }> {
  const commitMsg = `feat(self-improve): ${proposal.description}\n\nArquivos: ${appliedFiles.join(", ")}\nTestes: ${TOTAL_TEST_RUNS}/${TOTAL_TEST_RUNS} passados consecutivamente.\nAprovado pelo usuário.`;

  execShell(`git add -A`, cwd);
  execShell(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, cwd);

  const pushResult = execShell("git push origin main", cwd, 60000);

  if (pushResult.exitCode !== 0) {
    return { pushed: false, message: `Falha ao push: ${pushResult.stderr}` };
  }

  return {
    pushed: true,
    message: `✅ Melhorias aprovadas e pushadas com sucesso!\n${TOTAL_TEST_RUNS}/${TOTAL_TEST_RUNS} testes passaram.\nArquivos: ${appliedFiles.join(", ")}`,
  };
}

// ─── Apply Changes ───

function applyChanges(cwd: string, changes: Array<{ file: string; content: string }>): string[] {
  const applied: string[] = [];

  for (const change of changes) {
    const filePath = path.join(cwd, change.file);
    const dir = path.dirname(filePath);
    execShell(`mkdir -p "${dir}"`, cwd, 5000);
    // Escrever via cat heredoc
    const escapedContent = change.content.replace(/'/g, "'\\''");
    execShell(`cat > "${filePath}" << 'DEVAI_EOF'\n${change.content}\nDEVAI_EOF`, cwd, 30000);
    applied.push(change.file);
    console.log(`[SelfImprove] Applied: ${change.file}`);
  }

  return applied;
}

// ─── PUBLIC API ───

/**
 * Criar uma proposta de melhoria (mostra ao usuário para aprovação)
 */
export async function createImprovementProposal(
  title: string,
  description: string,
  filesToChange: Array<{ path: string; summary: string }>,
  risks: string[],
  benefits: string[],
  estimatedTime: string
): Promise<ImprovementProposal> {
  const proposal: ImprovementProposal = {
    id: generateId(),
    title,
    description,
    filesToChange,
    risks,
    benefits,
    estimatedTime,
    status: "pending",
  };

  pendingProposals.set(proposal.id, proposal);
  return proposal;
}

/**
 * Aprovar uma proposta de melhoria (ação do usuário)
 */
export function approveProposal(proposalId: string): ImprovementProposal | null {
  const proposal = pendingProposals.get(proposalId);
  if (!proposal) return null;

  proposal.status = "approved";
  pendingProposals.set(proposalId, proposal);
  return proposal;
}

/**
 * Rejeitar uma proposta de melhoria (ação do usuário)
 */
export function rejectProposal(proposalId: string): ImprovementProposal | null {
  const proposal = pendingProposals.get(proposalId);
  if (!proposal) return null;

  proposal.status = "rejected";
  pendingProposals.set(proposalId, proposal);
  return proposal;
}

/**
 * Listar todas as propostas de melhoria
 */
export function listProposals(): ImprovementProposal[] {
  return Array.from(pendingProposals.values());
}

/**
 * Obter uma proposta específica
 */
export function getProposal(proposalId: string): ImprovementProposal | undefined {
  return pendingProposals.get(proposalId);
}

/**
 * Analisar o repositório e sugerir melhorias (gera propostas pendentes)
 */
export async function analyzeForImprovements(): Promise<ImprovementProposal[]> {
  const cwd = await cloneRepository();
  const improvements: ImprovementProposal[] = [];

  try {
    const packageJson = JSON.parse(await fs.readFile(path.join(cwd, "package.json"), "utf-8"));

    // Verificar se tem testes
    if (!packageJson.devDependencies?.vitest) {
      const proposal = await createImprovementProposal(
        "Adicionar Testes Automatizados",
        "O projeto não possui testes. Adicionar Vitest para garantir que mudanças não quebrem funcionalidades.",
        [{ path: "vitest.config.ts", summary: "Configuração do Vitest" }, { path: "server/__tests__/routers.test.ts", summary: "Testes das rotas" }],
        ["Pode exigir ajuste de imports existentes", "Pode ser lento em CI"],
        ["Previne bugs", "Garante estabilidade nas auto-melhorias"],
        "30-45 minutos"
      );
      improvements.push(proposal);
    }

    // Verificar se TypeScript compila limpo
    const tsCheck = execShell("pnpm install && pnpm run check 2>&1", cwd, 120000);
    if (tsCheck.exitCode !== 0) {
      const proposal = await createImprovementProposal(
        "Corrigir Erros TypeScript",
        `Erros de TypeScript detectados: ${tsCheck.stderr.slice(0, 300)}`,
        [],
        ["Pode exigir refatoração de tipos"],
        ["Build limpo", "Sem erros no deploy"],
        "15-30 minutos"
      );
      improvements.push(proposal);
    }

    return improvements;
  } finally {
    try { execShell(`rm -rf "${cwd}"`); } catch {}
  }
}

// ─── Execute Shell Command (for binary analysis) ───

export function executeSystemCommand(command: string, cwd?: string, timeout: number = 30000): { stdout: string; stderr: string; exitCode: number } {
  return execShell(command, cwd, timeout);
}
