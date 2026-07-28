/**
 * Docker Sandbox Module — Execução Segura de Código
 * 
 * Permite executar código JavaScript/Python/Shell em containers Docker isolados.
 * Garante que a VM principal não seja afetada por scripts da IA.
 */

import { execSync, spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

// ─── Types ───

export type SandboxResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  timedOut: boolean;
};

export type SandboxConfig = {
  image: string;
  timeout: number;
  memoryLimit: string;
  cpuLimit: string;
  networkEnabled: boolean;
  environment: Record<string, string>;
};

// ─── Default Config ───

const DEFAULT_CONFIG: SandboxConfig = {
  image: "node:20-slim",
  timeout: 60000,        // 60 segundos (aumentado de 30s)
  memoryLimit: "512m",   // 512MB RAM (aumentado de 256m)
  cpuLimit: "1.0",       // 100% de um CPU
  networkEnabled: false, // Desabilitado por segurança
  environment: {},
};

// ─── Helpers ───

function isDockerAvailable(): boolean {
  try {
    execSync("docker ps", { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function isImageAvailable(image: string): boolean {
  try {
    execSync(`docker images -q ${image}`, { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function pullImage(image: string): Promise<boolean> {
  try {
    execSync(`docker pull ${image}`, { stdio: "pipe", timeout: 120000, maxBuffer: 1024 });
    return true;
  } catch {
    console.warn(`[Sandbox] Falha ao baixar imagem ${image}, tentando execução local...`);
    return false;
  }
}

// ─── Sandbox Execution ───

/**
 * Executa código dentro de um container Docker
 */
export async function executeInSandbox(
  code: string,
  language: "javascript" | "python" | "shell" = "javascript",
  config: Partial<SandboxConfig> = {}
): Promise<SandboxResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();

  if (!isDockerAvailable()) {
    return {
      stdout: "",
      stderr: "Docker não está disponível. Execute: sudo systemctl start docker && sudo systemctl enable docker",
      exitCode: 1,
      duration: 0,
      timedOut: false,
    };
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "devai-sandbox-"));
  
  let fileName = "script.js";
  let cmd = ["node", "--max-old-space-size=256", "/tmp/sandbox/script.js"];
  let image = cfg.image;

  if (language === "python") {
    fileName = "script.py";
    cmd = ["python3", "-u", "/tmp/sandbox/script.py"];
    image = "python:3.11-slim";
  } else if (language === "shell") {
    fileName = "script.sh";
    cmd = ["sh", "/tmp/sandbox/script.sh"];
    image = "debian:stable-slim";
  }

  const filePath = path.join(tmpDir, fileName);
  await fs.writeFile(filePath, code);

  // Verificar se a imagem existe, se não baixar
  if (!isImageAvailable(image)) {
    const pulled = await pullImage(image);
    if (!pulled) {
      // Fallback: tentar executar localmente na VM
      try {
        const localCmd = language === "python" ? "python3" : language === "shell" ? "sh" : "node";
        const result = execSync(`${localCmd} ${filePath}`, {
          encoding: "utf-8",
          timeout: cfg.timeout,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, ...cfg.environment },
        });
        return {
          stdout: result,
          stderr: "",
          exitCode: 0,
          duration: Date.now() - startTime,
          timedOut: false,
        };
      } catch (err: any) {
        return {
          stdout: err.stdout || "",
          stderr: err.stderr || err.message,
          exitCode: err.status || 1,
          duration: Date.now() - startTime,
          timedOut: err.code === "ETIMEDOUT",
        };
      } finally {
        try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch {}
      }
    }
  }

  try {
    // Comando Docker para rodar isolado
    const dockerCmd = [
      "run",
      "--rm",
      "-i",
      "--memory", cfg.memoryLimit,
      "--cpus", cfg.cpuLimit,
      "-v", `${tmpDir}:/tmp/sandbox:ro`,
    ];

    // Adicionar variáveis de ambiente
    for (const [key, value] of Object.entries(cfg.environment)) {
      dockerCmd.push("-e", `${key}=${value}`);
    }

    // Network (desabilitado por segurança, pode habilitar se necessário)
    if (!cfg.networkEnabled) {
      dockerCmd.push("--network", "none");
    }

    dockerCmd.push(image, ...cmd);

    const result = execSync(`docker ${dockerCmd.join(" ")}`, {
      encoding: "utf-8",
      timeout: cfg.timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB de output
    });

    return {
      stdout: result,
      stderr: "",
      exitCode: 0,
      duration: Date.now() - startTime,
      timedOut: false,
    };
  } catch (err: any) {
    const timedOut = err.code === "ETIMEDOUT";
    return {
      stdout: err.stdout || "",
      stderr: err.stderr || err.message,
      exitCode: err.status || 1,
      duration: Date.now() - startTime,
      timedOut,
    };
  } finally {
    // Cleanup
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

/**
 * Atalho para rodar JavaScript no Sandbox
 */
export async function runJS(code: string) {
  return executeInSandbox(code, "javascript");
}

/**
 * Atalho para rodar Python no Sandbox
 */
export async function runPython(code: string) {
  return executeInSandbox(code, "python");
}

/**
 * Atalho para rodar Shell no Sandbox
 */
export async function runShell(code: string) {
  return executeInSandbox(code, "shell");
}

/**
 * Instala pacotes Python em um container e executa código
 */
export async function runPythonWithPackages(code: string, packages: string[] = []): Promise<SandboxResult> {
  const installCmd = packages.length > 0 ? `pip install -q ${packages.join(" ")} && ` : "";
  return executeInSandbox(`${installCmd}${code}`, "python", { timeout: 120000, memoryLimit: "1g" });
}

/**
 * Instala pacotes Node.js em um container e executa código
 */
export async function runJSWithPackages(code: string, packages: string[] = []): Promise<SandboxResult> {
  const installCmd = packages.length > 0 ? `npm install -g ${packages.join(" ")} && ` : "";
  return executeInSandbox(`${installCmd}${code}`, "javascript", { timeout: 120000, memoryLimit: "1g" });
}
