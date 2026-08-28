import { randomUUID } from "node:crypto";
import { dispatchProjectSandbox } from "./githubApp";

export type ProjectSourceKind = "repository" | "archive" | "file" | "document";

const ALLOWED_REPOSITORY_HOSTS = new Set(["github.com", "www.github.com", "gitlab.com", "www.gitlab.com"]);

export function validateProjectSource(sourceUrl: string, sourceKind: ProjectSourceKind): URL {
  const url = new URL(sourceUrl);
  if (url.protocol !== "https:") throw new Error("A origem precisa usar HTTPS.");
  if (sourceKind === "repository" && !ALLOWED_REPOSITORY_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("Repositórios precisam usar um host de código autorizado.");
  }
  if (["archive", "file", "document"].includes(sourceKind) && ["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase())) {
    throw new Error("A origem local não pode ser acessada pelo executor remoto.");
  }
  return url;
}

export async function startProjectSandbox(params: {
  sourceUrl: string;
  sourceKind: ProjectSourceKind;
  task: string;
}) {
  if (!params.task.trim()) throw new Error("A tarefa não pode ficar vazia.");
  const source = validateProjectSource(params.sourceUrl, params.sourceKind);
  const jobId = randomUUID();
  const dispatched = await dispatchProjectSandbox({
    jobId,
    sourceUrl: source.toString(),
    sourceKind: params.sourceKind,
    task: params.task.trim(),
  });
  if (!dispatched) throw new Error("Não foi possível iniciar o executor do projeto.");
  return { jobId, status: "queued" as const };
}
