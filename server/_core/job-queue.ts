/**
 * Job Queue Module — Fila Assíncrona de Jobs
 * 
 * Gerencia a execução assíncrona de tarefas pesadas como:
 * - Auto-melhoria (clone, aplicar, testar, push)
 * - Resumo de conversas longas
 * - Extração de memórias semânticas
 * - Pruning de memórias antigas
 * 
 * Funciona em background sem bloquear requisições do usuário.
 */

// ─── Types ───

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type JobType = "self-improvement" | "summarize" | "extract-memories" | "prune-memories" | "custom";

export type Job = {
  id: string;
  type: JobType;
  title: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: string;
  error?: string;
  metadata?: Record<string, any>;
  progress?: number; // 0-100
};

// ─── Job Queue ───

const jobQueue: Job[] = [];
const runningJobs = new Set<string>();
const callbacks = new Map<string, Array<(job: Job) => void>>();
const MAX_CONCURRENT_JOBS = 2; // Máximo de jobs rodando simultaneamente
const POLL_INTERVAL_MS = 2000;

// ─── Worker ───

let workerRunning = false;

function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Adiciona um novo job à fila.
 */
export function enqueueJob(
  type: JobType,
  title: string,
  handler: (job: Job) => Promise<{ success: boolean; message: string }>,
  metadata?: Record<string, any>
): Job {
  const job: Job = {
    id: generateJobId(),
    type,
    title,
    status: "pending",
    createdAt: new Date().toISOString(),
    metadata,
    progress: 0,
  };

  jobQueue.push(job);

  // Armazena o handler no metadata para o worker acessar
  job.metadata = {
    ...metadata,
    __handler: handler,
  };

  console.log(`[JobQueue] Enqueued: ${title} (${job.id}) — Type: ${type}`);

  // Inicia o worker se não estiver rodando
  if (!workerRunning) {
    startWorker();
  }

  return job;
}

/**
 * Inicia o loop do worker que processa jobs da fila.
 */
function startWorker(): void {
  if (workerRunning) return;
  workerRunning = true;

  const processNext = async () => {
    while (workerRunning) {
      // Encontra jobs pendentes que ainda não estão rodando
      const pending = jobQueue.filter(j => j.status === "pending" && !runningJobs.has(j.id));

      if (pending.length === 0 || runningJobs.size >= MAX_CONCURRENT_JOBS) {
        // Aguarda e tenta novamente
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        continue;
      }

      const job = pending[0];
      runningJobs.add(job.id);

      try {
        job.status = "running";
        job.startedAt = new Date().toISOString();
        job.progress = 5;

        console.log(`[JobQueue] Starting job: ${job.title} (${job.id})`);

        const handler = job.metadata?.__handler;
        if (!handler) {
          throw new Error("Handler not found for job");
        }

        const result = await handler(job);

        job.status = result.success ? "completed" : "failed";
        job.result = result.message;
        job.progress = 100;
        job.completedAt = new Date().toISOString();

        console.log(`[JobQueue] Job ${job.id} ${job.status}: ${result.message}`);
      } catch (err) {
        job.status = "failed";
        job.error = (err as Error).message;
        job.progress = 0;
        job.completedAt = new Date().toISOString();
        console.error(`[JobQueue] Job ${job.id} failed:`, err);
      }

      runningJobs.delete(job.id);
      // Remove o handler do metadata (não precisa persistir)
      delete job.metadata?.__handler;

      // Notifica callbacks
      const jobCallbacks = callbacks.get(job.id) || [];
      for (const cb of jobCallbacks) {
        try { cb(job); } catch {}
      }
      callbacks.delete(job.id);

      // Small delay entre jobs
      await new Promise(r => setTimeout(r, 1000));
    }
  };

  processNext();
}

/**
 * Para o worker (usado em shutdown).
 */
export function stopWorker(): void {
  workerRunning = false;
  console.log("[JobQueue] Worker stopped");
}

// ─── Query Functions ───

/**
 * Obtém um job pelo ID.
 */
export function getJob(jobId: string): Job | undefined {
  return jobQueue.find(j => j.id === jobId);
}

/**
 * Lista todos os jobs (com filtro opcional).
 */
export function listJobs(type?: JobType, status?: JobStatus): Job[] {
  return jobQueue.filter(j => {
    if (type && j.type !== type) return false;
    if (status && j.status !== status) return false;
    return true;
  });
}

/**
 * Lista os jobs recentes (últimas 24h).
 */
export function getRecentJobs(limit: number = 20): Job[] {
  return jobQueue
    .filter(j => {
      const age = Date.now() - new Date(j.createdAt).getTime();
      return age <= 24 * 60 * 60 * 1000;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

/**
 * Aguarda a conclusão de um job (com timeout).
 */
export function waitForJob(jobId: string, timeoutMs: number = 300_000): Promise<Job> {
  return new Promise((resolve, reject) => {
    const job = jobQueue.find(j => j.id === jobId);
    if (!job) {
      reject(new Error(`Job not found: ${jobId}`));
      return;
    }

    if (job.status === "completed" || job.status === "failed") {
      resolve(job);
      return;
    }

    const timeout = setTimeout(() => {
      reject(new Error(`Job timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const currentCallbacks = callbacks.get(jobId) || [];
    callbacks.set(jobId, [...currentCallbacks, (updatedJob) => {
      clearTimeout(timeout);
      resolve(updatedJob);
    }]);
  });
}

/**
 * Cancela um job pendente.
 */
export function cancelJob(jobId: string): boolean {
  const job = jobQueue.find(j => j.id === jobId);
  if (!job) return false;

  if (job.status === "running") {
    console.log(`[JobQueue] Cannot cancel running job: ${jobId}`);
    return false;
  }

  if (job.status === "pending") {
    job.status = "cancelled";
    job.completedAt = new Date().toISOString();
    console.log(`[JobQueue] Cancelled job: ${jobId}`);
    return true;
  }

  return false;
}

/**
 * Retorna estatísticas da fila.
 */
export function getQueueStats() {
  const total = jobQueue.length;
  const pending = jobQueue.filter(j => j.status === "pending").length;
  const running = jobQueue.filter(j => j.status === "running").length;
  const completed = jobQueue.filter(j => j.status === "completed").length;
  const failed = jobQueue.filter(j => j.status === "failed").length;

  return { total, pending, running, completed, failed };
}
