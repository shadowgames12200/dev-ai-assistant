/**
 * Rotas para Ollama, Plugins e Voice Optimizer
 * Integração de modelos locais, plugins customizados e síntese de voz otimizada
 */

import { router, publicProcedure, protectedProcedure } from "../_core/trpc.js";
import { z } from "zod";
import { ollamaClient } from "../_core/ollama.js";
import { pluginLoader, initializePlugins } from "../_core/plugin-loader.js";
import { voiceOptimizer } from "../_core/voice-optimizer.js";

// Inicializar plugins ao carregar o módulo
initializePlugins().catch(err => console.error("[Routers] Erro ao inicializar plugins:", err));

export const ollamaPluginsVoiceRouter = router({
  // ─── Ollama ───
  ollama: router({
    checkAvailability: publicProcedure.query(async () => {
      const available = await ollamaClient.checkAvailability();
      const models = available ? await ollamaClient.listModels() : [];
      return { available, models };
    }),

    listModels: publicProcedure.query(async () => {
      return await ollamaClient.listModels();
    }),

    chat: protectedProcedure
      .input(z.object({
        messages: z.array(z.object({
          role: z.string(),
          content: z.string(),
        })),
        model: z.string().optional(),
        temperature: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const response = await ollamaClient.chat(input.messages, {
            model: input.model,
            temperature: input.temperature,
            stream: false,
          });
          return { success: true, response };
        } catch (err) {
          return { success: false, error: (err as Error).message };
        }
      }),
  }),

  // ─── Plugins ───
  plugins: router({
    list: publicProcedure.query(async () => {
      const plugins = pluginLoader.getLoadedPlugins();
      return plugins.map(p => ({
        name: p.name,
        description: p.description,
        parameters: p.parameters,
        language: p.language,
      }));
    }),

    execute: protectedProcedure
      .input(z.object({
        name: z.string(),
        args: z.record(z.any()),
      }))
      .mutation(async ({ input }) => {
        try {
          const result = await pluginLoader.executePlugin(input.name, input.args);
          return { success: true, result };
        } catch (err) {
          return { success: false, error: (err as Error).message };
        }
      }),

    reload: protectedProcedure.mutation(async () => {
      try {
        const plugins = await pluginLoader.loadAllPlugins();
        return { success: true, count: plugins.length };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    }),
  }),

  // ─── Voice Optimizer ───
  voiceOptim: router({
    synthesize: protectedProcedure
      .input(z.object({
        text: z.string(),
        language: z.string().optional(),
        speed: z.number().optional(),
        provider: z.enum(["openai", "google", "azure"]).optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          let buffer: Buffer;

          if (input.provider === "google") {
            buffer = await voiceOptimizer.synthesizeGoogle(input.text, {
              language: input.language || "pt-BR",
              speed: input.speed || 1.0,
              cacheEnabled: true,
            });
          } else if (input.provider === "azure") {
            buffer = await voiceOptimizer.synthesizeAzure(input.text, {
              language: input.language || "pt-BR",
              speed: input.speed || 1.0,
              cacheEnabled: true,
            });
          } else {
            // Padrão: OpenAI com fallback
            buffer = await voiceOptimizer.synthesizeWithFallback(input.text, {
              language: input.language || "pt-BR",
              speed: input.speed || 1.0,
              cacheEnabled: true,
            });
          }

          return { success: true, audioBase64: buffer.toString("base64") };
        } catch (err) {
          return { success: false, error: (err as Error).message };
        }
      }),

    cacheStats: publicProcedure.query(() => {
      return voiceOptimizer.getCacheStats();
    }),

    clearCache: protectedProcedure.mutation(() => {
      voiceOptimizer.clearCache();
      return { success: true };
    }),
  }),
});
