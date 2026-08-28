import { createPrivateKey } from "node:crypto";
import { SignJWT } from "jose";
import axios from "axios";

const GITHUB_API = "https://api.github.com";
const OWNER = "shadowgames12200";
const REPOSITORY = "dev-ai-assistant";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} não configurado`);
  return value;
}

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n");
}

export async function getGitHubAppInstallationToken(): Promise<string> {
  const appId = required("GITHUB_APP_ID");
  const installationId = required("GITHUB_APP_INSTALLATION_ID");
  const privateKey = normalizePrivateKey(required("GITHUB_APP_PRIVATE_KEY"));
  const key = createPrivateKey({ key: privateKey, format: "pem", type: "pkcs1" });
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(appId)
    .setIssuedAt(now - 30)
    .setExpirationTime(now + 540)
    .sign(key);

  const response = await axios.post(
    `${GITHUB_API}/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    { repositories: [REPOSITORY] },
    { headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json" } },
  );
  return response.data.token as string;
}

export function getGitHubRepository(): { owner: string; repository: string } {
  return { owner: OWNER, repository: REPOSITORY };
}

export async function dispatchProjectSandbox(params: {
  jobId: string;
  sourceUrl: string;
  sourceKind: "repository" | "archive" | "file" | "document";
  task: string;
}): Promise<boolean> {
  const token = await getGitHubAppInstallationToken();
  const response = await axios.post(
    `${GITHUB_API}/repos/${OWNER}/${REPOSITORY}/actions/workflows/project-sandbox.yml/dispatches`,
    {
      ref: "main",
      inputs: {
        job_id: params.jobId,
        source_url: params.sourceUrl,
        source_kind: params.sourceKind,
        task: params.task,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  return response.status === 204;
}
