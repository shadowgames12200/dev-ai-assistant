/**
{
  "name": "github_integration",
  "description": "Integração com GitHub - Gerencie repos, issues e PRs",
  "parameters": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["list_repos", "list_issues", "create_issue", "get_repo_info"],
        "description": "Ação a executar"
      },
      "repo": {
        "type": "string",
        "description": "Nome do repositório (formato: owner/repo)"
      },
      "title": {
        "type": "string",
        "description": "Título da issue"
      },
      "body": {
        "type": "string",
        "description": "Descrição da issue"
      }
    },
    "required": ["action"]
  }
}
*/

export default async function githubIntegration(args) {
  const { action, repo, title, body } = args;

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return `⚠️ GitHub não está configurado. Para usar:
1. Acesse https://github.com/settings/tokens
2. Crie um token com permissões: repo, issues
3. Configure a variável: GITHUB_TOKEN`;
  }

  try {
    const baseUrl = "https://api.github.com";

    switch (action) {
      case "list_repos": {
        const response = await fetch(`${baseUrl}/user/repos`, {
          headers: { Authorization: `token ${token}` },
        });
        const repos = await response.json();
        return `📦 Seus repositórios:\n${repos
          .slice(0, 10)
          .map(r => `- ${r.name} (${r.stargazers_count} ⭐)`)
          .join("\n")}`;
      }

      case "list_issues": {
        if (!repo) return "❌ Especifique o repositório (owner/repo)";
        const response = await fetch(`${baseUrl}/repos/${repo}/issues`, {
          headers: { Authorization: `token ${token}` },
        });
        const issues = await response.json();
        return `🐛 Issues em ${repo}:\n${issues
          .slice(0, 5)
          .map(i => `- #${i.number}: ${i.title}`)
          .join("\n")}`;
      }

      case "create_issue": {
        if (!repo || !title) return "❌ Especifique repo e title";
        const response = await fetch(`${baseUrl}/repos/${repo}/issues`, {
          method: "POST",
          headers: {
            Authorization: `token ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title, body: body || "" }),
        });
        const issue = await response.json();
        return `✅ Issue criada: #${issue.number} - ${issue.title}`;
      }

      case "get_repo_info": {
        if (!repo) return "❌ Especifique o repositório (owner/repo)";
        const response = await fetch(`${baseUrl}/repos/${repo}`, {
          headers: { Authorization: `token ${token}` },
        });
        const repoData = await response.json();
        return `📊 ${repoData.name}\n⭐ ${repoData.stargazers_count} stars\n👁️ ${repoData.watchers_count} watchers\n🍴 ${repoData.forks_count} forks\n📝 ${repoData.description}`;
      }

      default:
        return "Ação desconhecida";
    }
  } catch (error) {
    return `❌ Erro: ${error.message}`;
  }
}
