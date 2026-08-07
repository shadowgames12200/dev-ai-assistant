/**
{
  "name": "slack_integration",
  "description": "Integração com Slack - Envie mensagens e gerencie canais",
  "parameters": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["send_message", "list_channels", "get_user_info"],
        "description": "Ação a executar"
      },
      "channel": {
        "type": "string",
        "description": "Nome ou ID do canal"
      },
      "message": {
        "type": "string",
        "description": "Mensagem a enviar"
      },
      "user": {
        "type": "string",
        "description": "Username ou ID do usuário"
      }
    },
    "required": ["action"]
  }
}
*/

export default async function slackIntegration(args) {
  const { action, channel, message, user } = args;

  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    return `⚠️ Slack não está configurado. Para usar:
1. Acesse https://api.slack.com/apps
2. Crie um novo app
3. Ative o Bot Token Scopes: chat:write, channels:read, users:read
4. Configure a variável: SLACK_BOT_TOKEN`;
  }

  try {
    const baseUrl = "https://slack.com/api";

    switch (action) {
      case "send_message": {
        if (!channel || !message) return "❌ Especifique channel e message";
        const response = await fetch(`${baseUrl}/chat.postMessage`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel,
            text: message,
          }),
        });
        const result = await response.json();
        return result.ok
          ? `✅ Mensagem enviada para #${channel}`
          : `❌ Erro: ${result.error}`;
      }

      case "list_channels": {
        const response = await fetch(`${baseUrl}/conversations.list`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await response.json();
        return `📢 Canais:\n${result.channels
          .slice(0, 10)
          .map(c => `- #${c.name}`)
          .join("\n")}`;
      }

      case "get_user_info": {
        if (!user) return "❌ Especifique o usuário";
        const response = await fetch(`${baseUrl}/users.info?user=${user}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await response.json();
        const u = result.user;
        return `👤 ${u.real_name}\n📧 ${u.profile.email}\n💬 ${u.profile.status_text}`;
      }

      default:
        return "Ação desconhecida";
    }
  } catch (error) {
    return `❌ Erro: ${error.message}`;
  }
}
