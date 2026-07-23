import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { systemRouter } from "./_core/systemRouter.js";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db.js";
import { invokeGroq } from "./_core/groq.js";
import { storagePut } from "./storage.js";
import { analyzeBinaryFile, isTextFile, isImageFile, extractTextFromBuffer } from "./_core/file-analyzer.js";
import {
  executeApprovedImprovement,
  createImprovementProposal,
  approveProposal,
  rejectProposal,
  listProposals,
  getProposal,
  executeSystemCommand,
} from "./_core/self-improvement.js";

const SYSTEM_PROMPT = `Você é o DevAI, um assistente de programação e produtividade extremamente competente. Você foi inspirado no Manus AI.

=== COMO RESPONDER ===
Sempre responda de forma profissional, estruturada e organizada. Use Markdown para formatar suas respostas com:
- Títulos e subtítulos (## e ###)
- Listas organizadas
- Blocos de código com linguagem especificada
- Negrito para destacar conceitos importantes
- Tabelas quando apropriado para comparar opções

Suas respostas devem ser completas, detalhadas e úteis. Não seja superficial. Quando o usuário pedir algo, entregue o resultado completo e funcional.

=== CAPACIDADES DE ANÁLISE ===
Você pode analisar:
- **Imagens**: Descreva o que vê, identifique código, diagramas, erros na tela, etc.
- **Código-fonte**: Analise, corrija bugs, sugira melhorias, explique a lógica
- **Documentos de texto**: Resuma, analise, extraia informações
- **Arquivos ZIP/RAR**: Liste o conteúdo, identifique executáveis, código e configurações
- **Executáveis (.exe, .dll, ELF)**: Analise as strings, identifique arquitetura, detecte comportamento
- **PDFs**: Extraia texto e analise o conteúdo
- **Arquivos de configuração**: Analise configs, .env, YAML, JSON, etc.
- **Logs**: Identifique erros, warnings e padrões

=== QUANDO O USUÁRIO ENVIA UM ARQUIVO COM UM PEDIDO ===
Se o usuário enviar um arquivo (RAR, ZIP, APK, executável, etc.) junto com um pedido como "crie um igual", "faça algo parecido", "clone esse projeto", etc.:

1. Analise o arquivo para entender sua estrutura e finalidade
2. Entenda EXATAMENTE o que o usuário quer (leia o pedido dele junto com o arquivo)
3. Gere o código completo e funcional conforme solicitado
4. Explique a estrutura, funcionalidades e como usar
5. ENTREGUE O RESULTADO COMPLETO — não apenas uma análise superficial do arquivo

NUNCA responda apenas com informações técnicas do arquivo (tamanho, MIME type, header) quando o usuário fez um pedido de criação junto com o arquivo. O pedido do usuário é o que importa.

=== REGRA FUNDAMENTAL: APROVAÇÃO ===
Você SÓ deve pedir aprovação quando o pedido é para MELHORAR O PRÓPRIO SISTEMA DevAI (este sistema que está rodando).

Exemplos de quando pedir aprovação:
- "Melhore a IA para que ela faça X"
- "Adicione uma nova funcionalidade no sistema"
- "Corrija o bug no código do DevAI"
- "Otimize o sistema"
- "Atualize as dependências do projeto"

Exemplos de quando NÃO pedir aprovação (execute direto):
- "Crie um programa para X"
- "Faça um site como esse"
- "Crie um script que faça Y"
- "Faça uma API para Z"
- "Crie um app igual a esse arquivo"
- "Me dê o código de um programa tipo..."
- "Construa uma ferramenta para..."
- "Clone esse projeto e faça mudanças"
- Qualquer pedido que NÃO altere o código-fonte do DevAI

=== RESUMO ===
- Criar programas, código, projetos, ferramentas, apps, sites → EXECUTE DIRETO, sem aprovação
- Modificar o sistema DevAI em si → CRIE PROPOSTA e AGUARDE APROVAÇÃO
- Quando receber arquivo + pedido de criação: analise o arquivo para entender o contexto, depois CRIE o que foi pedido

=== FLUXO DE APROVAÇÃO (só para auto-melhoria do sistema DevAI) ===
Quando o usuário aprovar uma auto-melhoria:
1. Clonar o repositório em um diretório temporário
2. Implementar as mudanças no clone
3. Testar 20 vezes consecutivas para garantir estabilidade TOTAL
4. Se algum teste falhar → corrigir automaticamente e testar de novo
5. Repetir até TODOS os 20 testes passarem consecutivamente
6. Máximo de 3 rodadas de correção
7. Só aplicar (push) se 20/20 testes passarem

IMPORTANTE: Para aprovar, o dono deve fornecer a APPROVAL_KEY (chave secreta configurada no servidor).
Se outro usuário (não dono) tentar aprovar, a tentativa será REJEITADA automaticamente.
Se a chave estiver errada, avise que "Só o dono pode aprovar melhorias."`;


function truncateMessagesForContext(messages: any[], maxContentLength: number = 200000): any[] {
  let totalLength = 0;
  const truncated = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    totalLength += content.length;
    if (totalLength <= maxContentLength) {
      truncated.unshift(msg);
    } else {
      break;
    }
  }

  return truncated;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    login: publicProcedure
      .input(z.object({ username: z.string(), password: z.string() }))
      .mutation(async () => {
        throw new TRPCError({ code: "FORBIDDEN" });
      }),
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      // @ts-ignore
      const cookieOptions = getSessionCookieOptions(ctx.req);
      // @ts-ignore
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  conversations: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      return db.getUserConversations(ctx.user.id);
    }),
    create: protectedProcedure
      .input(z.object({ title: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const id = await db.createConversation(ctx.user.id, input.title ?? "Nova");
        return { id, title: input.title };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await db.deleteConversation(input.id, ctx.user.id);
        return { success: true };
      }),
    rename: protectedProcedure
      .input(z.object({ id: z.number(), title: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await db.updateConversationTitle(input.id, input.title);
        return { success: true };
      }),
    messages: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const conv = await db.getConversation(input.id, ctx.user.id);
        if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
        return db.getConversationMessages(input.id);
      }),
  }),

  upload: router({
    uploadFile: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        fileName: z.string(),
        fileContent: z.string(),
        fileType: z.string(),
        userMessage: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const { conversationId, fileName, fileContent, fileType, userMessage } = input;
        const buffer = Buffer.from(fileContent, "base64");

        let fileUrl = "";
        try {
          const res = await storagePut(fileName, buffer, fileType);
          fileUrl = res.url;
        } catch (storageErr) {
          console.warn("[Upload] Storage save failed:", (storageErr as Error).message);
        }

        const isImage = isImageFile(fileType);
        const isText = isTextFile(fileName, fileType);

        let content: string;
        if (isImage) {
          content = `${userMessage || ""}\n[Imagem anexada: ${fileName}]`;
        } else if (isText) {
          const text = extractTextFromBuffer(buffer, fileName, fileType);
          content = `${userMessage || ""}\n[Arquivo: ${fileName}]\n\nConteúdo:\n\`\`\`\n${text}\n\`\`\``;
        } else {
          const analysis = analyzeBinaryFile(buffer, fileName, fileType);
          content = `${userMessage || ""}\n\n${analysis}`;
        }

        await db.addMessage(conversationId, "user", content, fileUrl, fileName);
        const history = await db.getConversationMessages(conversationId);
        const truncatedHistory = truncateMessagesForContext(history);

        try {
          const groqMessages: any[] = [
            { role: "system", content: SYSTEM_PROMPT }
          ];

          for (const msg of truncatedHistory) {
            if (msg.role === "system") continue;

            if (msg.role === "user" && isImage && msg.fileName === fileName) {
              const imageText = userMessage || "Analise esta imagem e me diga o que você vê.";
              groqMessages.push({
                role: "user",
                content: [
                  { type: "text", text: imageText },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${fileType};base64,${fileContent}`,
                      detail: "high",
                    },
                  },
                ],
              });
            } else {
              groqMessages.push({
                role: msg.role,
                content: msg.content,
              });
            }
          }

          const model = isImage ? "qwen/qwen3.6-27b" : "llama-3.3-70b-versatile";
          const response = await invokeGroq({ model, messages: groqMessages, maxTokens: 4000, temperature: 0.7 });
          const aiMsg = response.choices[0]?.message?.content || "Desculpe, não consegui gerar uma resposta.";
          await db.addMessage(conversationId, "assistant", aiMsg);
        } catch (err) {
          console.error("[Upload] Groq error:", err);
          await db.addMessage(conversationId, "assistant", `Erro ao processar: ${(err as Error).message}`);
        }

        return { success: true, messages: await db.getConversationMessages(conversationId) };
      }),
  }),

  chat: router({
    send: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        content: z.string(),
        useAdvancedReasoning: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await db.addMessage(input.conversationId, "user", input.content);
        const history = await db.getConversationMessages(input.conversationId);
        const truncatedHistory = truncateMessagesForContext(history);

        try {
          const groqMessages: any[] = [
            { role: "system", content: SYSTEM_PROMPT }
          ];

          for (const msg of truncatedHistory) {
            if (msg.role === "system") continue;
            groqMessages.push({ role: msg.role, content: msg.content });
          }

          const response = await invokeGroq({
            model: "llama-3.3-70b-versatile",
            messages: groqMessages,
            maxTokens: 4000,
            temperature: 0.7,
          });

          const aiMsg = response.choices[0]?.message?.content || "Desculpe, não consegui gerar uma resposta.";
          await db.addMessage(input.conversationId, "assistant", aiMsg);
        } catch (err) {
          console.error("[Chat] Groq error:", err);
          await db.addMessage(input.conversationId, "assistant", `Erro: ${(err as Error).message}`);
        }

        return { success: true, messages: await db.getConversationMessages(input.conversationId) };
      }),
  }),

  // ─── Self-Improvement Router (COM APROVAÇÃO OBRIGATÓRIA) ───
  selfImprove: router({
    /**
     * Criar uma proposta de melhoria (mostra ao usuário para aprovação)
     * A IA chama isso para SUGERIR melhorias, NÃO para aplicar
     */
    propose: protectedProcedure
      .input(z.object({
        title: z.string().describe("Título da melhoria proposta"),
        description: z.string().describe("Descrição detalhada do que será feito"),
        filesToChange: z.array(z.object({
          path: z.string().describe("Caminho do arquivo"),
          summary: z.string().describe("Resumo do que será mudado neste arquivo"),
        })).describe("Lista de arquivos que serão modificados"),
        risks: z.array(z.string()).describe("Riscos potenciais da mudança").optional(),
        benefits: z.array(z.string()).describe("Benefícios esperados").optional(),
        estimatedTime: z.string().describe("Tempo estimado para a melhoria").optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

        const proposal = await createImprovementProposal(
          input.title,
          input.description,
          input.filesToChange,
          input.risks || [],
          input.benefits || [],
          input.estimatedTime || "10-30 minutos"
        );

        // Enviar mensagem ao usuário pedindo aprovação
        let msg = `📋 **Proposta de Auto-Melhoria**\n\n`;
        msg += `**ID:** \`${proposal.id}\`\n`;
        msg += `**Título:** ${proposal.title}\n`;
        msg += `**Descrição:** ${proposal.description}\n\n`;
        msg += `**Arquivos a modificar:**\n`;
        msg += proposal.filesToChange.map(f => `- \`${f.path}\`: ${f.summary}`).join("\n");
        msg += `\n\n`;
        msg += `**Riscos:** ${proposal.risks.length > 0 ? proposal.risks.join(", ") : "Baixo"}`;
        msg += `\n**Benefícios:** ${proposal.benefits.length > 0 ? proposal.benefits.join(", ") : "N/A"}`;
        msg += `\n**Tempo estimado:** ${proposal.estimatedTime}\n\n`;
        msg += `---\n`;
        msg += `⏳ **Aguardando sua aprovação.** Para aprovar, use o comando:\n\`/aprovar <ID> <SUA_CHAVE_SECRETA>\`\n\nSe você não é o dono, pode apenas sugerir — não pode aprovar.`;

        await db.addMessage(1, "assistant", msg);

        return { success: true, proposalId: proposal.id, proposal } as const;
      }),

    /**
     * O DONO aprova a proposta — EXIGE uma approval key secreta
     * Outros usuários só podem SUGERIR, não aprovar
     */
    approve: protectedProcedure
      .input(z.object({
        proposalId: z.string().describe("ID da proposta a ser aprovada"),
        approvalKey: z.string().describe("Chave secreta de aprovação do dono"),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

        // Verificar se a approval key é válida
        // A chave deve ser configurada no .env como APPROVAL_KEY
        const expectedKey = process.env.APPROVAL_KEY || "";

        if (!expectedKey) {
          return { success: false, message: "Approval key não configurada no servidor. O dono precisa configurar APPROVAL_KEY no .env." };
        }

        if (input.approvalKey !== expectedKey) {
          // Registrar tentativa não autorizada
          const proposal = getProposal(input.proposalId);
          const msg = `⚠️ **TENTATIVA DE APROVAÇÃO NÃO AUTORIZADA**\n\nAlguém tentou aprovar a proposta "${proposal?.title || input.proposalId}" sem a chave correta.\n**Só o dono pode aprovar melhorias.**`;
          await db.addMessage(1, "assistant", msg);
          return { success: false, message: "Chave de aprovação inválida. Só o dono pode aprovar melhorias." };
        }

        const proposal = getProposal(input.proposalId);
        if (!proposal) {
          return { success: false, message: "Proposta não encontrada. Peça para eu gerar uma nova proposta." };
        }

        if (proposal.status === "approved") {
          return { success: false, message: "Esta proposta já está aprovada e em execução." };
        }

        if (proposal.status === "rejected") {
          return { success: false, message: "Esta proposta foi rejeitada. Peça uma nova proposta." };
        }

        approveProposal(input.proposalId);

        const msg = `✅ **Proposta aprovada pelo DONO!** Iniciando execução...\n\n**${proposal.title}**\nClonando repositório, aplicando mudanças e testando 20 vezes consecutivas...`;
        await db.addMessage(1, "assistant", msg);

        return { success: true, message: "Proposta aprovada pelo dono. Executando..." };
      }),

    /**
     * O USUÁRIO rejeita a proposta
     */
    reject: protectedProcedure
      .input(z.object({
        proposalId: z.string().describe("ID da proposta a ser rejeitada"),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

        rejectProposal(input.proposalId);

        const msg = `❌ **Proposta rejeitada.** As mudanças foram descartadas.`;
        await db.addMessage(1, "assistant", msg);

        return { success: true, message: "Proposta rejeitada e descartada." };
      }),

    /**
     * Executar a melhoria (só pode ser chamado pelo próprio sistema após aprovação)
     */
    execute: protectedProcedure
      .input(z.object({
        proposalId: z.string().describe("ID da proposta aprovada"),
        files: z.array(z.object({
          path: z.string().describe("Caminho do arquivo"),
          content: z.string().describe("Conteúdo completo do arquivo"),
        })).describe("Arquivos com as mudanças"),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

        const proposal = getProposal(input.proposalId);
        if (!proposal) {
          return { success: false, message: "Proposta não encontrada." };
        }

        if (proposal.status !== "approved") {
          return {
            success: false,
            message: `Proposta não está aprovada (status: ${proposal.status}). Você precisa aprovar antes de executar.`,
          };
        }

        // Registrar início
        await db.addMessage(1, "assistant", `🔧 **Executando:** ${proposal.title}\nTestando 20 vezes consecutivas...`);

        try {
          const result = await executeApprovedImprovement(input.proposalId, input.files);

          const resultMsg = result.success
            ? `✅ **Auto-Melhoria Concluída!**\n\n${result.message}\n\n**Resultados dos testes:** ${result.testsPassed}/${result.totalTestsRun} passaram\n**Push:** ${result.pushed ? "Sim" : "Não"}`
            : `❌ **Auto-Melhoria Falhou**\n\n${result.message}\n\n**Resultados dos testes:** ${result.testsPassed}/${result.totalTestsRun} passaram\nMudanças revertidas para proteger o repositório.`;

          await db.addMessage(1, "assistant", resultMsg);
          return { success: result.success, result } as const;
        } catch (err) {
          const errorMsg = `💥 **Erro na Auto-Melhoria**\n\n${(err as Error).message}\nNenhuma mudança foi aplicada.`;
          await db.addMessage(1, "assistant", errorMsg);
          return { success: false, error: (err as Error).message } as const;
        }
      }),

    /**
     * Listar todas as propostas de melhoria
     */
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      return listProposals();
    }),

    /**
     * Obter detalhes de uma proposta específica
     */
    get: protectedProcedure
      .input(z.object({ proposalId: z.string() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        return getProposal(input.proposalId);
      }),

    /**
     * Executar comando do sistema (para análise de arquivos)
     */
    executeCommand: protectedProcedure
      .input(z.object({
        command: z.string().describe("Comando do sistema a ser executado"),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

        const safeCommands = ["file", "strings", "hexdump", "unzip", "ls", "cat", "head", "tail", "wc", "grep", "find", "du", "stat"];
        const cmdParts = input.command.split(/\s+/);
        const baseCmd = cmdParts[0];

        if (!safeCommands.includes(baseCmd)) {
          return {
            success: false,
            output: "",
            error: `Comando não permitido: ${baseCmd}. Permitidos: ${safeCommands.join(", ")}`,
          } as const;
        }

        try {
          const result = executeSystemCommand(input.command, undefined, 30000);
          return {
            success: result.exitCode === 0,
            output: result.stdout.slice(0, 5000),
            error: result.stderr.slice(0, 2000),
          } as const;
        } catch (err) {
          return { success: false, output: "", error: (err as Error).message } as const;
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
