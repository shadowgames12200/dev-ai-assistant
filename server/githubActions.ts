import axios from "axios";

export async function triggerAgentSandbox(params: {
  improvementId: number;
  title: string;
  description: string;
}) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO_OWNER = "shadowgames12200";
  const REPO_NAME = "dev-ai-assistant";

  if (!GITHUB_TOKEN) {
    console.error("[GitHubActions] GITHUB_TOKEN not configured.");
    return false;
  }

  try {
    const response = await axios.post(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/agent-sandbox.yml/dispatches`,
      {
        ref: "main",
        inputs: {
          improvement_id: String(params.improvementId),
          title: params.title,
          description: params.description,
        },
      },
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    return response.status === 204;
  } catch (error: any) {
    console.error("[GitHubActions] Error triggering workflow:", error.response?.data || error.message);
    return false;
  }
}
