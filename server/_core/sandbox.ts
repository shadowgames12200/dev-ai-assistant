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
};

// ─── Default Config ───

const DEFAULT_CONFIG: SandboxConfig = {
  image: "node:20-slim", // Imagem padrão
  timeout: 30000,        // 30 segundos
  memoryLimit: "256m",   // 256MB RAM
  cpuLimit: "0.5",       // 50% de um CPU
};

// ─── Helpers ───

function isDockerAvailable(): boolean {
  try {
    execSync("docker ps", { stdio: "ignore" });
    return true;
  } catch {
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
  
  if (!isDockerAvailable()) {
    return {
      stdout: "",
      stderr: "Docker não está disponível ou instalado na VM Azure. Use 'sudo apt install docker.io' para habilitar o sandbox.",
      exitCode: 1,
      duration: 0,
      timedOut: false,
    };
  }

  const startTime = Date.now();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "devai-sandbox-"));
  
  let fileName = "script.js";
  let cmd = ["node", "/tmp/sandbox/script.js"];
  let image = cfg.image;

  if (language === "python") {
    fileName = "script.py";
    cmd = ["python3", "/tmp/sandbox/script.py"];
    image = "python:3.11-slim";
  } else if (language === "shell") {
    fileName = "script.sh";
    cmd = ["sh", "/tmp/sandbox/script.sh"];
    image = "debian:stable-slim";
  }

  const filePath = path.join(tmpDir, fileName);
  await fs.writeFile(filePath, code);

  try {
    // Comando Docker para rodar isolado
    // --rm: remove container após rodar
    // -v: monta o volume do script
    // --memory: limita RAM
    // --cpus: limita CPU
    // --network none: desabilita rede por segurança (opcional)
    const dockerCmd = [
      "run",
      "--rm",
      "-i",
      "--network", "none",
      "--memory", cfg.memoryLimit,
      "--cpus", cfg.cpuLimit,
      "-v", `${tmpDir}:/tmp/sandbox:ro`,
      image,
      ...cmd
    ];

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
