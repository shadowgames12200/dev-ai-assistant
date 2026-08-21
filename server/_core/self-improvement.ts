/**
 * Self-Improvement Module v4
 * Permite que o DevAI melhore a si mesma de forma autônoma.
 */
import { execSync } from "child_process";
import path from "path";
import os from "os";
import * as db from "../db";

const REPO_URL = "https://github.com/shadowgames12200/dev-ai-assistant.git";
const TOTAL_TEST_RUNS = 20;
const MAX_RETRY_ROUNDS = 3;

function execShell(command: string, cwd: string, timeout: number = 120000): any {
  try {
    const result = execSync(command, {
      cwd: cwd || os.tmpdir(),
      encoding: "utf-8",
      timeout,
      env: { ...process.env },
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: result, stderr: "", exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err?.stdout || "",
      stderr: err.stderr || err.message || "",
      exitCode: err.status || 1,
    };
  }
}

async function cloneRepository() {
  const tmpDir = execSync('mktemp -d').toString().trim();
  const cloneDir = path.join(tmpDir, "dev-ai-assistant");
  execShell(`git clone ${REPO_URL} ${cloneDir}`, tmpDir);
  
  const githubToken = process.env.GITHUB_TOKEN || "";
  if (githubToken) {
    execShell(`git remote set-url origin https://${githubToken}@github.com/shadowgames12200/dev-ai-assistant.git`, cloneDir);
  }
  return cloneDir;
}

export async function listProposals() {
  return await db.getPendingImprovements();
}

export async function approveProposal(id: number) {
  await db.updateImprovementStatus(id, "approved");
  return { id, status: "approved" };
}

export async function rejectProposal(id: number) {
  await db.updateImprovementStatus(id, "rejected");
  return { id, status: "rejected" };
}

export async function createDirectedProposal(topic: string, reason?: string) {
  return await db.createImprovementProposal({
    title: `Melhoria direcionada: ${topic}`,
    description: reason || `Solicitação do usuário sobre ${topic}`,
    filesToChange: [],
    risks: ["Mudanças no código fonte", "Necessidade de testes extensivos"],
    benefits: [`Melhoria no conhecimento sobre ${topic}`],
    estimatedTime: "30-60 min",
  });
}

export async function createProposalFromLearningQueue() {
  // Simplificado para esta versão
  return null;
}
