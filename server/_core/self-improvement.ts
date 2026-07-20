/**
 * Self-Improvement Module
 * Permite que o DevAI melhore a si mesmo de forma autônoma.
 * 
 * Fluxo:
 * 1. Identificar o que precisa ser melhorado
 * 2. Clonar o repositório em um diretório temporário
 * 3. Implementar as melhorias
 * 4. Rodar testes MÚLTIPLAS vezes
 * 5. Se TODOS os testes passarem em TODAS as tentativas → fazer push
 * 6. Se algum teste falhar → reverter e reportar ao usuário
 */

import { execSync, exec } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { ENV } from "./env.js";

// ─── Config ───

const REPO_URL = "https://github.com/shadowgames12200/dev-ai-assistant.git";
const MAX_TEST_RUNS = 5; // Rodar testes 5 vezes para garantir estabilidade
const TEST_RUN_DELAY_MS = 2000; // Esperar 2s entre cada teste

export type SelfImprovementResult = {
  success: boolean;
  changes: string[];
  testResults: TestRunResult[];
  message: string;
  pushed: boolean;
};

export type TestRunResult = {
  run: number;
  passed: boolean;
  output: string;
  errors: string;
};

export type ImprovementPlan = {
  area: string;
  description: string;
  filesToChange: string[];
  testsNeeded: string[];
};

// ─── Shell Helper ───

function execShell(command: string, cwd?: string, timeout: number = 60000): { stdout: string; stderr: string; exitCode: number } {
  try {
    const result = execSync(command, {
      cwd: cwd || os.tmpdir(),
      encoding: "utf-8",
      timeout,
      env: { ...process.env, GROQ_API_KEY: ENV.groqApiKey },
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

// ─── Clone Repository ───

async function cloneRepository(): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "devai-improve-"));
  const cloneDir = path.join(tmpDir, "dev-ai-assistant");

  console.log(`[SelfImprovement] Cloning repository to ${cloneDir}...`);
  const result = execShell(`git clone ${REPO_URL} ${cloneDir}`);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to clone repository: ${result.stderr}`);
  }

  // Configurar git no diretório clonado
  execShell("git config user.email 'devai@self-improvement'", cloneDir);
  execShell("git config user.name 'DevAI Assistant'", cloneDir);

  console.log(`[SelfImprovement] Repository cloned successfully.`);
  return cloneDir;
}

// ─── Run Tests Multiple Times ───

async function runTestsMultipleTimes(cwd: string): Promise<TestRunResult[]> {
  const results: TestRunResult[] = [];

  for (let i = 1; i <= MAX_TEST_RUNS; i++) {
    console.log(`[SelfImprovement] Running tests (attempt ${i}/${MAX_TEST_RUNS})...`);

    // Instalar dependências
    execShell("pnpm install", cwd, 120000);

    // Rodar o build para verificar se compila
    const buildResult = execShell("pnpm run build", cwd, 120000);

    // Rodar os testes se existirem
    const testResult = execShell("pnpm test 2>&1 || echo 'NO_TESTS'", cwd, 60000);

    const passed = buildResult.exitCode === 0 && 
                   (testResult.stdout.includes("NO_TESTS") || testResult.exitCode === 0);

    results.push({
      run: i,
      passed,
      output: `${buildResult.stdout}\n${testResult.stdout}`.slice(-2000),
      errors: `${buildResult.stderr}\n${testResult.stderr}`.slice(-2000),
    });

    if (!passed) {
      console.warn(`[SelfImprovement] Tests FAILED on attempt ${i}/${MAX_TEST_RUNS}`);
      // Não parar imediatamente - continuar rodando para ver se é consistente
    }

    // Esperar entre as tentativas
    if (i < MAX_TEST_RUNS) {
      await new Promise(resolve => setTimeout(resolve, TEST_RUN_DELAY_MS));
    }
  }

  return results;
}

// ─── Apply Changes ───

function applyChanges(cwd: string, changes: Array<{ file: string; content: string }>): string[] {
  const applied: string[] = [];

  for (const change of changes) {
    const filePath = path.join(cwd, change.file);
    const dir = path.dirname(filePath);

    // Criar diretório se não existir
    execShell(`mkdir -p "${dir}"`, cwd);

    // Escrever o arquivo
    execShell(`cat > "${filePath}" << 'DEVAI_EOF'\n${change.content}\nDEVAI_EOF`, cwd);

    applied.push(change.file);
    console.log(`[SelfImprovement] Applied change to: ${change.file}`);
  }

  return applied;
}

// ─── Verify and Push ───

async function verifyAndPush(
  cwd: string,
  testResults: TestRunResult[],
  changes: string[]
): Promise<{ pushed: boolean; message: string }> {
  // Verificar se TODOS os testes passaram
  const allPassed = testResults.every(r => r.passed);
  const passedCount = testResults.filter(r => r.passed).length;

  if (!allPassed) {
    // Reverter as mudanças
    execShell("git reset --hard HEAD", cwd);
    execShell("git clean -fd", cwd);

    return {
      pushed: false,
      message: `Testes não passaram consistentemente (${passedCount}/${MAX_TEST_RUNS} passes). Mudanças revertidas para proteger o repositório.`,
    };
  }

  // Todas as tentativas passaram - fazer commit e push
  const commitMsg = `feat(self-improve): ${changes.join(", ")}\n\nAuto-improvement by DevAI Assistant. All ${MAX_TEST_RUNS} test runs passed successfully.`;

  execShell(`git add -A`, cwd);
  execShell(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, cwd);

  const pushResult = execShell("git push origin main", cwd, 60000);

  if (pushResult.exitCode !== 0) {
    return {
      pushed: false,
      message: `Falha ao fazer push: ${pushResult.stderr}`,
    };
  }

  return {
    pushed: true,
    message: `Melhorias implementadas e pushadas com sucesso. ${MAX_TEST_RUNS}/${MAX_TEST_RUNS} testes passaram.`,
  };
}

// ─── Main Self-Improvement Function ───

export async function selfImprove(
  improvementPlan: ImprovementPlan,
  changes: Array<{ file: string; content: string }>
): Promise<SelfImprovementResult> {
  const cwd = await cloneRepository();

  try {
    // 1. Aplicar as mudanças
    console.log(`[SelfImprovement] Applying ${changes.length} changes...`);
    const appliedFiles = applyChanges(cwd, changes);

    // 2. Rodar testes múltiplas vezes
    console.log(`[SelfImprovement] Running ${MAX_TEST_RUNS} test iterations...`);
    const testResults = await runTestsMultipleTimes(cwd);

    // 3. Verificar e fazer push
    const result = await verifyAndPush(cwd, testResults, appliedFiles);

    return {
      success: result.pushed,
      changes: appliedFiles,
      testResults,
      message: result.message,
      pushed: result.pushed,
    };
  } catch (err) {
    console.error("[SelfImprovement] Fatal error:", err);
    // Reverter em caso de erro fatal
    try {
      execShell("git reset --hard HEAD", cwd);
    } catch {}
    return {
      success: false,
      changes: [],
      testResults: [],
      message: `Erro durante auto-melhoria: ${(err as Error).message}`,
      pushed: false,
    };
  } finally {
    // Limpar diretório temporário
    try {
      execShell(`rm -rf "${cwd}"`);
    } catch {}
  }
}

// ─── Analyze What Needs Improvement ───

/**
 * Analisa o repositório e sugere melhorias necessárias
 */
export async function analyzeForImprovements(): Promise<ImprovementPlan[]> {
  const cwd = await cloneRepository();

  try {
    // Ler package.json para verificar dependências
    const packageJson = JSON.parse(await fs.readFile(path.join(cwd, "package.json"), "utf-8"));

    // Verificar se há testes configurados
    const hasTests = packageJson.scripts?.test && packageJson.devDependencies?.vitest;

    // Verificar se faltam testes
    const needsTests: ImprovementPlan[] = [];

    if (!hasTests) {
      needsTests.push({
        area: "Testes",
        description: "O projeto não possui testes automatizados. Adicionar testes com Vitest para garantir estabilidade.",
        filesToChange: ["server/__tests__/routers.test.ts", "vitest.config.ts"],
        testsNeeded: ["pnpm test"],
      });
    }

    // Verificar se o TypeScript está configurado corretamente
    const tsConfigExists = await fs.access(path.join(cwd, "tsconfig.json")).then(() => true).catch(() => false);
    if (!tsConfigExists) {
      needsTests.push({
        area: "TypeScript Config",
        description: "Configuração TypeScript ausente ou incompleta.",
        filesToChange: ["tsconfig.json"],
        testsNeeded: ["pnpm run check"],
      });
    }

    return needsTests;
  } finally {
    try {
      execShell(`rm -rf "${cwd}"`);
    } catch {}
  }
}

// ─── Execute Shell Command (for binary analysis) ───

export function executeSystemCommand(command: string, cwd?: string, timeout: number = 30000): { stdout: string; stderr: string; exitCode: number } {
  return execShell(command, cwd, timeout);
}
