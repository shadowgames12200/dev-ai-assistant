import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Readable } from "node:stream";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { storagePut } from "./storage";
import type { ImageContent, Message, TextContent } from "./_core/llm";
import { ENV } from "./_core/env";

// Download a file (storage URL or public URL) as a Buffer.
async function downloadBuffer(url: string): Promise<Buffer> {
  const resp = await fetch(url, { redirect: "follow" });
  if (!resp.ok) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Não foi possível ler o arquivo anexado (${url})`,
    });
  }
  return Buffer.from(await resp.arrayBuffer());
}

const SYSTEM_PROMPT = `Você é o DevAI Assistant, um assistente inteligente especializado em programação, produtividade e geração de renda com IA. Seu dono é Charles (charleshenriquegonsalves05@gmail.com), que usa você como plataforma para prestar serviços e ganhar dinheiro online.

## Suas diretrizes gerais
- Responda em português brasileiro, de forma clara e objetiva.
- Quando fornecer código, use blocos de código markdown com a linguagem correta.
- Seja didático: explique o "porquê" das suas recomendações quando relevante.
- Se receber conteúdo de arquivos anexados, leve em consideração esse contexto na resposta.
- Se a pergunta não tiver relação com programação ou produtividade, responda de forma breve e amigável, redirecionando para o escopo do assistente.

## PADRÃO DE QUALIDADE (obrigatório em TODA entrega)
O dono usa você para entregar trabalhos PAGOS a clientes. Toda entrega precisa passar por uma auto-revisão antes de ser apresentada:
1. REVISE VOCÊ MESMO o que produziu antes de entregar: ortografia, gramática, coerência, formatação e formato do arquivo.
2. Nunca entregue na primeira tentativa: gere a versão final revisada, como um profissional humano revisaria.
3. Verifique se o arquivo está no formato correto que o cliente pediu (.docx para textos, .xlsx para planilhas, .txt ou .docx para transcrições).
4. Nunca deixe texto pela metade, instruções incompletas ou placeholders (nunca escreva "Insira seu nome aqui" em um currículo já pronto — se faltar dado, pergunte ao dono antes).
5. Se faltar informação do cliente para concluir o trabalho, PERGUNTE antes de concluir, em vez de inventar dados.
6. Ao final de cada trabalho, mostre um breve resumo de checagem: o que foi feito, formato do arquivo e o que o dono deve conferir antes de entregar ao cliente.
7. Padrão de nível sênior: escreva como um redator/analista experiente, não como iniciante. Frases completas, sem gírias, sem erro de digitação.

## Seus 4 modelos de negócio de renda (foque aqui quando o dono pedir)

### Modelo 1: Serviços freelancer por texto (Workana/99Freelas)
- Currículos, planilhas, transcrições, redação de artigos, revisão e tradução.
- Tudo é feito por chat e arquivo — ninguém vê o rosto do dono.
- Faixas: transcrição até 30min R$20-35 | 30min-2h R$40-80 | longas R$100-150 | artigo 500-1000 palavras R$30-80 | revisão R$20-50 | currículo R$30-50 | planilha R$50-100.
- Proposta vencedora: saudação personalizada, prova de entendimento, mini-amostra, prazo claro, preço justo.

### Modelo 2: Marketing e gestão de conteúdo
- Produção de posts para redes sociais, legendas, copywriting para anúncios, roteiros para YouTube/TikTok (sem mostrar rosto do dono), artigos de blog.
- Cobrar por pacote: ex. 10 posts + legendas = R$50-100; roteiro YouTube = R$30-60.
- Usar a IA para gerar rapidamente conteúdo de qualidade profissional.

### Modelo 3: Plataforma com créditos (vender acessos da própria IA)
- Divulgar o link da IA; clientes criam conta própria e usam sozinhos.
- Novos usuários ganham 50 créditos de teste grátis (1 crédito = 1 mensagem normal, 5 = modo agente).
- Quando acabarem, o cliente recarrega pagando o valor definido pelo dono (admin configurável).
- Futuro: pagamento automático via Pix (webhook Mercado Pago/Asaas) liberando créditos sem intervenção manual.

### Modelo 4: Automações sob demanda
- Scripts Python/Node para automatizar tarefas repetitivas (planilhas, scraping, organização de dados, envio de emails).
- Preços: automação simples R$50-100 | complexa R$100-300.
- Usar a capacidade de execução da VM (Docker sandbox) para testar antes de entregar.
- Programação em qualquer linguagem, incluindo assembly/máquina com NASM/GCC/GDB/QEMU.

## Seus 3 trabalhos principais de renda (foque aqui quando o dono pedir)

### 1. Currículos, planilhas e materiais profissionais (R$ 30 a R$ 100)
- Currículo: formato limpo (nome, contato, resumo profissional de 3-4 linhas, experiência em ordem cronológica inversa, formação, habilidades), máx. 1-2 páginas, linguagem de ação ("Gerenciei", "Elaborei"), SEM erros de ortografia e SEM design exagerado. Entregar em .docx.
- Planilha: cabeçalhos claros, formatação consistente, fórmulas testadas, instruções de uso na primeira aba, sem células vazias inesperadas. Entregar em .xlsx.
- Antes de iniciar, confirme com o dono: dados da pessoa/empresa, vaga ou finalidade, e prazo.

### 2. Redação, revisão e transcrição (R$ 20 a R$ 150)
- Redação de artigos/posts: título forte, introdução com gancho, parágrafos curtos, conclusão com chamada para ação; artigos de 500-1000 palavras bem estruturados com subtítulos.
- Transcrição de áudio: transcreva fielmente com pontuação correta, parágrafos por troca de falante, marcadores de tempo [MM:SS] quando pedido, identificação de ruídos com [inaudível] em vez de inventar palavras. Entregar em .docx ou .txt.
- Ofereça sempre o extra "transcrição + resumo" (+R$ 10 a R$ 20): o resumo deve ter os pontos principais em 5-10 linhas.
- Revisão: liste as correções feitas e devolva o texto corrigido + a lista de mudanças.

### 3. Tradução (PT/EN e outros)
- Tradução fiel e natural (não literal): adapte expressões para soar natural no idioma de destino.
- Ao traduzir, mantenha a formatação original (títulos, listas, parágrafos).
- Nunca misture idiomas na entrega. Se o dono só fala português, traduza também o resultado para português quando for um áudio/texto de compreensão.

## Orientação de mercado: Workana vs 99Freelas
- Recomende ao dono começar pelo WORKANA (workana.com, pelo navegador — nunca por apps de loja): maior volume de vagas de redação, transcrição e tradução, preços melhores, propostas por vaga (flexível para horários vagos), ~10% de comissão.
- 99Freelas (app oficial da loja ou 99freelas.com) como segundo canal depois de ter avaliações no Workana.
- Perfil: categoria principal "Tradução e conteúdos", função "Redação de Artigos", habilidades "Escrita de artigos, Edição de textos, Tradução", experiência honesta "1 a 3 anos".
- Propostas vencedoras: saudação personalizada, prova de entendimento do problema do cliente, mini-amostra ou trecho de entrega no primeiro dia, prazo claro, preço justo dentro das faixas abaixo, chamada para ação no final.
- Preços: transcrição até 30 min R$ 20-35; 30min-2h R$ 40-80; longas R$ 100-150; legendas SRT R$ 30-60/vídeo; artigo 500-1000 palavras R$ 30-80; revisão de texto R$ 20-50; currículo R$ 30-50; planilha R$ 50-100.
- Negociar sempre por valor entregue, nunca por hora.

## Vender assinaturas da própria plataforma (modelo de créditos)
- Quando o dono perguntar como vender acessos: oriente criar conta para o cliente (com e-mail dele), entregar login e senha, explicar que novos usuários ganham 50 créditos de teste grátis.
- Quando os créditos de teste acabarem, o cliente recarrega pagando o valor que o dono definir (configurável no painel admin).
- Divulgação: grupos de WhatsApp, Instagram e indicação de amigos; não prometer resultados ao cliente, apenas descrever o que a plataforma faz.

## Programação (todas as linguagens)
Você é expert em TODAS as linguagens e stacks: Python, JavaScript/TypeScript, HTML/CSS, PHP, Java, C/C++, C#, Go, Rust, Swift, Kotlin, Ruby, SQL, Shell/Bash, PowerShell, e também linguagem de máquina/assembly (x86, x86-64, ARM, NASM, GAS).
- Debugging: analise erros com método — leia a mensagem de erro, reproduza, isole a causa, corrija, explique a correção.
- Para cada código entregue: explique o que faz, como executar, e possíveis erros comuns.
- Deploy e infraestrutura Linux: nginx, systemd/PM2, Docker, SSH, permissões, redes — sempre com comandos prontos para copiar e colar.
- Nunca entregar código sem testar a lógica mentalmente; percorrer os caminhos felizes e os de erro antes de apresentar.
- Se o dono pedir para resolver um problema no servidor/VM: siga passo a passo, mostre cada comando, explique o que ele faz e avise antes de qualquer comando destrutivo (rm, dd, formatação).

## Assembly / linguagem de máquina (com execução real)
- O sistema roda numa VM Linux com ferramentas de compilação disponíveis: NASM (assembler x86/x86-64), GCC, GDB (debugger) e, quando instalado, QEMU (emulação de outras arquiteturas).
- Quando o dono pedir código assembly: escreva, monte e EXECUTE para testar antes de apresentar o resultado (nasm -f elf64 file.asm && ld file.o -o file && ./file).
- Use o modo agente/executor para rodar os testes e traga o resultado real (saída, erros) ao dono.
- Para debugging assembly: explique registradores, memória e instruções linha por linha, de forma didática, pois o dono não é programador.
- Se a ferramenta de uma arquitetura não estiver disponível na VM, avise honestamente e sugira a alternativa (ex.: emular ARM via QEMU).

## Como ajudar o dono a fechar clientes
- Quando o dono pedir ajuda para um serviço de cliente, entregue o trabalho COMPLETO e em padrão profissional: versão pronta para uso, revisão ortográfica, estrutura correta e tom adequado ao público.
- Sugira sempre variações (2 a 3 opções) para o dono escolher o melhor para o cliente.
- Ajude a escrever propostas e orçamentos claros, com escopo, preço e prazo.

## Regras de integridade (NUNCA quebrar)
- NUNCA invente resultados, métricas, depoimentos ou dados falsos para clientes.
- NUNCA prometa prazos impossíveis: considere que a plataforma roda numa VM pequena (1GB RAM); tarefas pesadas podem demorar minutos. Avise o dono honestamente sobre prazos.
- NUNCA expor credenciais nem executar comandos em servidores de terceiros.
- Se uma tarefa for grande demais para a infraestrutura, explique o porquê e sugira dividir em partes menores.

## Modo agente (detecção automática)
Você é capaz de detectar quando uma mensagem do usuário é uma tarefa autônoma (scripts, processamento de arquivos, automações, pesquisas complexas, ferramentas) e sinalizar isso. Quando for o caso, avise na resposta: "Vou processar isso em modo agente, pois é uma tarefa autônoma que exige execução passo a passo."

## Auto-melhoria
Se o dono pedir para melhorar o próprio sistema, gere um plano concreto e seguro de melhoria (código, performance, UX, otimização para a VM).
`;

export const chatRouter = router({
  // ─── Conversations ───

  conversations: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      return db.getUserConversations(ctx.user.id);
    }),
    create: protectedProcedure
      .input(z.object({ title: z.string().max(256).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const id = await db.createConversation(ctx.user.id, input.title ?? "Nova conversa");
        return { id, title: input.title ?? "Nova conversa" };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await db.deleteConversation(input.id, ctx.user.id);
        return { success: true };
      }),
    rename: protectedProcedure
      .input(z.object({ id: z.number(), title: z.string().max(256) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const conv = await db.getConversation(input.id, ctx.user.id);
        if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada" });
        await db.updateConversationTitle(input.id, input.title);
        return { success: true };
      }),
    messages: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const conv = await db.getConversation(input.id, ctx.user.id);
        if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada" });
        return db.getConversationMessages(input.id);
      }),
    attachments: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const conv = await db.getConversation(input.conversationId, ctx.user.id);
        if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada" });
        return db.getConversationAttachments(input.conversationId);
      }),
  }),

  // ─── Chat with streaming ───

  chat: router({
    send: protectedProcedure
      .input(
        z.object({
          conversationId: z.number(),
          content: z.string().min(1).max(50000),
          attachmentIds: z.array(z.number()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

        const conv = await db.getConversation(input.conversationId, ctx.user.id);
        if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada" });

        // Store user message
        await db.addMessage(input.conversationId, "user", input.content);

        // Collect attachment context (images as inline base64 for the LLM,
        // text-like files have their content extracted into the prompt)
        const attachmentTextContext: string[] = [];
        const attachmentImages: { fileName: string; base64: string; mime: string }[] = [];
        const attIds = input.attachmentIds ?? [];
        if (attIds.length > 0) {
          const allAttachments = await db.getConversationAttachments(input.conversationId);
          const selected = allAttachments.filter((a) => attIds.includes(a.id));
          const { extractTextContent } = await import("./fileExtraction");
          // Resolve storage-relative URLs against this server's base so the
          // storage proxy (/manus-storage/*) serves them (works in dev and in
          // the deployed Node backend on Vercel).
          const base = `${(ctx.req as any).protocol ?? "https"}://${(ctx.req as any).headers?.host ?? "localhost"}`;
          for (const att of selected) {
            const absUrl = att.storageUrl.startsWith("http")
              ? att.storageUrl
              : `${base}${att.storageUrl.startsWith("/") ? "" : "/"}${att.storageUrl}`;
            if (att.fileType.startsWith("image/")) {
              const buf = await downloadBuffer(absUrl);
              attachmentImages.push({
                fileName: att.fileName,
                base64: buf.toString("base64"),
                mime: att.fileType,
              });
            } else {
              const extracted = await extractTextContent(absUrl, att.fileType, att.fileName);
              attachmentTextContext.push(extracted);
            }
          }
        }

        // Build conversation history (last 40 messages)
        const history = await db.getConversationMessages(input.conversationId);
        const recent = history.slice(-40);
        const llmMessages: Message[] = [
          { role: "system", content: SYSTEM_PROMPT },
          ...recent
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        ];
        // Append attachment context to the user message
        const lastIdx = llmMessages.length - 1;
        const extraParts: string[] = [];
        if (attachmentTextContext.length > 0) {
          extraParts.push(...attachmentTextContext);
        }
        const baseContent = llmMessages[lastIdx].content as string;
        const imageParts: (TextContent | ImageContent)[] = [];
        for (const img of attachmentImages) {
          imageParts.push({
            type: "text",
            text: `[Imagem anexada: ${img.fileName}]`,
          });
          imageParts.push({
            type: "image_url",
            image_url: { url: `data:${img.mime};base64,${img.base64}` },
          });
        }
        llmMessages[lastIdx] = {
          ...llmMessages[lastIdx],
          content: [
            { type: "text" as const, text: baseContent },
            ...extraParts.map((t) => ({ type: "text" as const, text: t })),
            ...imageParts,
          ],
        };

        // Streaming response via SSE
        const res = ctx.res as any;
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });

        const encoder = new TextEncoder();
        let finished = false;
        const safeWrite = (buf: Uint8Array) => {
          try {
            if (res.writableEnded || finished) return;
            res.write(buf);
          } catch {
            finished = true;
          }
        };
        const safeEnd = () => {
          try {
            if (!res.writableEnded && !finished) {
              finished = true;
              res.end();
            }
          } catch {
            finished = true;
          }
        };
        res.on("close", () => {
          finished = true;
        });

        try {
          // ─── Agent-mode classifier (light LLM pass) ─────────────────────
          // Decide if the message is an autonomous task BEFORE charging credits.
          // Autonomous tasks cost AGENT_COST_PER_MESSAGE (5) instead of 1.
          let agentMode = false;
          const AGENT_HINTS = /execute|rodar|run|script|processar|process|automatiz|automation|pesquisa complex|ferramenta|tool|arquivo(s)? grande|batch|loop|iterate|baixar|download|compilar|build|testar|test|debug|debuggar/i;
          if (AGENT_HINTS.test(input.content || "")) {
            try {
              const { invokeLLMStream } = await import("./_core/llm");
              const clsResp = await invokeLLMStream({
                model: "gemini-3.6-flash",
                messages: [
                  { role: "system", content: "Você é um classificador de intenção. Responda APENAS com 'agent' ou 'chat'. Responda 'agent' se a mensagem pede execução autônoma de código, processamento de arquivos, automação, pesquisa complexa, ferramentas, ou qualquer tarefa que exija múltiplos passos de execução. Responda 'chat' caso contrário." },
                  { role: "user", content: input.content || "" },
                ],
              });
              const clsReader = (clsResp.body as ReadableStream).getReader();
              const clsDecoder = new TextDecoder();
              let clsText = "";
              while (true) {
                const { done, value } = await clsReader.read();
                if (done) break;
                clsText += clsDecoder.decode(value, { stream: true });
              }
              agentMode = /^agent/i.test(clsText.trim());
            } catch (clsErr) {
              // Classifier failed → fall back to regex hint
              agentMode = AGENT_HINTS.test(input.content || "");
            }
          }
          // ─────────────────────────────────────────────────────────────────

          try {
            const creditsMod = await import("./_core/credits");
            const isOwner = ctx.user.role === "admin";
            if (!isOwner) {
              // Grant the 50-credit trial to new common users (idempotent)
              await creditsMod.grantTrial(ctx.user.id);
              const balance = await creditsMod.getBalance(ctx.user.id);
              const cost = agentMode
                ? creditsMod.AGENT_COST_PER_MESSAGE
                : creditsMod.getCostPerMessage();
              if (balance >= Math.max(1, cost)) {
                await creditsMod.adjust(ctx.user.id, -cost);
              } else {
                if (!finished && !res.writableEnded) {
                  res.write(
                    "data: " +
                    JSON.stringify({
                      content: `Você está sem créditos para ${agentMode ? "o modo agente (5 créditos)" : "enviar mensagens"}. Entre em contato com o administrador para recarregar.`,
                    }) +
                    "\n\n"
                  );
                  res.end();
                }
                finished = true;
                return;
              }
            }
          } catch (creditErr) {
            console.warn("[Chat] credits adjust failed:", creditErr);
          }
          // ─── Agent-mode notice via SSE ──────────────────────────────
          if (agentMode) {
            try {
              res.write(
                "data: " +
                JSON.stringify({
                  content: "⚙️ **Modo agente ativado** — vou processar isso em modo agente, pois é uma tarefa autônoma que exige execução passo a passo. (5 créditos debitados)\n\n",
                  agentMode: true,
                }) +
                "\n\n"
              );
            } catch (noticeErr: any) {
              console.warn("[Chat] agent-mode notice failed:", noticeErr?.message);
            }
          }
          // ─────────────────────────────────────────────────────────────
          // ─── Self-improvement detection ──────────────────────────────
          const SELF_IMPROVE_RE = /melhore (o sistema|a si (mesma|mesmo)|voc[eê]|se)|melhoria (no|na) sistema|auto[- ]melhoria|mejorar el sistema|improve (the )?system|self[- ]improvement/i;
          if (SELF_IMPROVE_RE.test(input.content || "")) {
            try {
              const { invokeLLMStream } = await import("./_core/llm");
              const planResp = await invokeLLMStream({
                model: "gemini-3.6-flash",
                messages: [
                  { role: "system", content: "Você é o módulo de auto-melhoria do DevAI Assistant. O usuário pediu para você melhorar o próprio sistema. Gere UM plano de melhoria concreto e seguro, em JSON. Nunca sugira nada destrutivo (nunca apagar dados de usuários, nunca expor credenciais, nunca executar comandos remotos em servidores de terceiros). Foque em melhorias de código, performance, UX, correção de bugs e otimização para a VM (pouca memória). Responda APENAS com um JSON contendo as chaves title, description, filesToChange, risks e benefits" },
                  { role: "user", content: input.content || "" },
                ],
              });
              const planReader = (planResp.body as ReadableStream).getReader();
              const planDecoder = new TextDecoder();
              let planText = "";
              while (true) {
                const { done, value } = await planReader.read();
                if (done) break;
                planText += planDecoder.decode(value, { stream: true });
              }
              const jsonMatch = planText.match(/```json\s*([\s\S]*?)```|([\s\S]*)/);
              let plan = null;
              try {
                const raw = jsonMatch ? (jsonMatch[1] || jsonMatch[2]) : planText;
                plan = JSON.parse(raw);
                if (!plan.title && !plan.description) throw new Error("empty plan");
              } catch {
                // Regex extraction per field as fallback
                const pick = (key: string) => {
                  const re = new RegExp('"' + key + '"\\s*:\\s*"?([^"\\n,}\\]]+)', "i");
                  const m = planText.match(re);
                  return m ? m[1].trim().slice(0, 200) : "";
                };
                const pickArr = (key: string) => {
                  const re = new RegExp('"' + key + '"\\s*:\\s*\\[([\\s\\S]*?)\\]', "i");
                  const m = planText.match(re);
                  if (!m) return [];
                  return m[1].split(",").map((s) => s.replace(/["']/g, "").trim()).filter(Boolean).slice(0, 8);
                };
                plan = {
                  title: pick("title") || "Melhoria sugerida pela IA",
                  description: pick("description") || planText.replace(/[\s\S]*?\{|\}.*$/, "").slice(0, 400),
                  filesToChange: pickArr("filesToChange"),
                  risks: pickArr("risks"),
                  benefits: pickArr("benefits"),
                };
              }
              // Only register meaningful proposals (skip empty failure artifacts)
              if (!plan.title && !plan.description && (!plan.filesToChange || plan.filesToChange.length === 0)) {
                plan = null;
              }
              let proposal = null;
              if (plan) {
                const si = await import("./_core/self-improvement");
                proposal = await si.createImprovementProposal(
                  plan.title || "Melhoria sugerida",
                  (plan.description || "") + (plan.benefits?.length ? " Benefícios: " + plan.benefits.join("; ") : ""),
                  plan.filesToChange || [],
                  plan.risks || ["Nenhum risco conhecido"],
                  plan.benefits || [],
                  "Automático"
                );
              }
              if (!finished && !res.writableEnded) { try {
                res.write(
                  "data: " +
                  JSON.stringify({
                    content:
                      (proposal
                        ? "🤖 Criei uma proposta de auto-melhoria baseada no seu pedido:\n\n**" +
                          (plan.title || "Melhoria sugerida") +
                          "**\n\n" +
                          (plan.description || "") +
                          "\n\nComo dono, você pode revisar e aprovar em **/approvals** (é preciso informar a chave secreta). Nada será alterado sem sua aprovação explícita."
                        : "🤖 Recebi seu pedido de melhoria. Tentei gerar um plano, mas a IA de planejamento não respondeu agora (rede instável). Tente novamente em alguns instantes."),
                  }) +
                  "\n\n"
                );
                } catch (sseErr: any) { console.warn('[Chat] SSE write failed:', sseErr?.message); }
                res.end();
              }
              finished = true;
              return;
            } catch (siErr) {
              console.warn("[Chat] self-improve plan failed:", siErr);
              // fall through to normal chat reply
            }
          }
          // ─────────────────────────────────────────────────────────────
          const { invokeLLMStream } = await import("./_core/llm");
          const llmResponse = await invokeLLMStream({
            model: "gemini-3.6-flash",
            messages: llmMessages as any,
          });

          let fullContent = "";
          const reader = (llmResponse.body as ReadableStream<Uint8Array>).getReader();
          const decoder = new TextDecoder();
          let insideThinking = false;
          let buffer = "";

          // Pipe upstream SSE to the client SSE, extracting content deltas.
          // Filter out <thinking> ... </thinking> blocks from non-Gemini providers.
          // Listen to `res` close (not req) so the upstream is not aborted after the first event.
          while (true) {
            const { done, value } = await reader.read();
            if (done || finished) break;
            const text = decoder.decode(value, { stream: true });
            const lines = text.split("\n").filter((l: string) => l.startsWith("data: "));
            for (const line of lines) {
              const payload = line.slice(6);
              if (payload === "[DONE]") break;
              try {
                const json = JSON.parse(payload);
                const delta =
                  json.choices?.[0]?.delta?.content ??
                  json.choices?.[0]?.message?.content ??
                  "";
                if (delta) {
                  // Filter thinking tags from the stream
                  buffer += delta;
                  let filtered = "";
                  let rest = buffer;

                  // Handle opening tag
                  if (!insideThinking) {
                    const thinkStart = rest.indexOf("<thinking>");
                    if (thinkStart >= 0) {
                      // Emit everything before the opening tag
                      if (thinkStart > 0) {
                        filtered = rest.slice(0, thinkStart);
                      }
                      rest = rest.slice(thinkStart + "<thinking>".length);
                      insideThinking = true;
                    } else {
                      filtered = rest;
                      rest = "";
                    }
                  }

                  // Handle closing tag while inside thinking
                  if (insideThinking) {
                    const thinkEnd = rest.indexOf("</thinking>");
                    if (thinkEnd >= 0) {
                      // Emit everything after the closing tag
                      const after = rest.slice(thinkEnd + "</thinking>".length);
                      // Find any subsequent <thinking> tag in the after part
                      const nextThink = after.indexOf("<thinking>");
                      if (nextThink >= 0) {
                        filtered += after.slice(0, nextThink);
                        buffer = after.slice(nextThink + "<thinking>".length);
                      } else {
                        filtered += after;
                        insideThinking = false;
                        buffer = "";
                      }
                    } else {
                      // Still inside thinking, check for partial closing tag at end
                      const partialClose = "</thinking>";
                      let found = false;
                      for (let i = Math.min(rest.length, partialClose.length); i > 0; i--) {
                        if (rest.endsWith(partialClose.slice(0, i))) {
                          buffer = partialClose.slice(0, i);
                          found = true;
                          break;
                        }
                      }
                      if (!found) buffer = "";
                    }
                  }

                  if (filtered) {
                    fullContent += filtered;
                    safeWrite(encoder.encode(`data: ${JSON.stringify({ content: filtered })}\n\n`));
                  }
                }
              } catch {
                // Ignore malformed chunks
              }
            }
          }

          safeWrite(encoder.encode("data: [DONE]\n\n"));
          safeEnd();

          // Persist assistant message
          try {
            await db.addMessage(input.conversationId, "assistant", fullContent);
          } catch (e) {
            console.error("[Chat] Failed to persist assistant message:", e);
          }
        } catch (error) {
          console.error("[Chat] LLM error:", error);
          if (!finished) {
            res.write(
              encoder.encode(
                `data: ${JSON.stringify({ error: "Erro ao gerar resposta. Tente novamente." })}\n\n`
              )
            );
            safeWrite(encoder.encode("data: [DONE]\n\n"));
            res.end();
          }
        }

        // Mark as finished for tRPC mutation return (caller uses SSE, not the return)
        return { conversationId: input.conversationId, streaming: true };
      }),
  }),

  // ─── Upload ───

  upload: router({
    uploadFile: protectedProcedure
      .input(
        z.object({
          conversationId: z.number(),
          fileName: z.string().min(1).max(512),
          fileContent: z.string(), // base64
          fileType: z.string().max(128),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

        const conv = await db.getConversation(input.conversationId, ctx.user.id);
        if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada" });

        const buffer = Buffer.from(input.fileContent, "base64");
        // ~4MB limit on Vercel serverless
        if (buffer.length > 4 * 1024 * 1024) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Arquivo muito grande. O limite é 4MB.",
          });
        }

        const ext = input.fileName.split(".").pop() ?? "";
        const key = `${ctx.user.id}-files/${Date.now()}-${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { url } = await storagePut(key, buffer, input.fileType || "application/octet-stream");

        const attId = await db.addAttachment({
          conversationId: input.conversationId,
          userId: ctx.user.id,
          fileName: input.fileName,
          fileType: input.fileType,
          fileSize: buffer.length,
          storageUrl: url,
        });

        return { id: attId, url, fileName: input.fileName };
      }),
  }),
});
