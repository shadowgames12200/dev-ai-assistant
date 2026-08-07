/**
 * Rotas para Capacidades Avançadas
 * Raciocínio Profundo, Navegação Web, Integrações e Geração de Mídia
 */

import { router, publicProcedure, protectedProcedure } from "../_core/trpc.js";
import { z } from "zod";
import { deepReasoningEngine, invokeDeepReasoning } from "../_core/deep-reasoning.js";
import { webNavigator, navigateAndExtract } from "../_core/web-navigator.js";
import { mediaGenerator } from "../_core/media-generator.js";

export const advancedFeaturesRouter = router({
  // ─── Raciocínio Profundo ───
  deepReasoning: router({
    reason: protectedProcedure
      .input(z.object({
        question: z.string(),
        context: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const response = await invokeDeepReasoning(input.question, input.context);
          return {
            success: true,
            thinking: response.thinking,
            finalAnswer: response.finalAnswer,
            complexity: response.complexity,
            totalThinkingTime: response.totalThinkingTime,
            formatted: deepReasoningEngine.formatResponse(response),
          };
        } catch (err) {
          return { success: false, error: (err as Error).message };
        }
      }),
  }),

  // ─── Navegação Web ───
  webNav: router({
    navigate: protectedProcedure
      .input(z.object({
        url: z.string().url(),
        actions: z.array(z.object({
          type: z.enum(["goto", "click", "fill", "extract", "wait", "screenshot"]),
          target: z.string().optional(),
          value: z.string().optional(),
          selectors: z.record(z.string()).optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        try {
          const result = await navigateAndExtract(input.url, input.actions);
          return {
            success: result.success,
            steps: result.steps,
            extractedData: result.extractedData,
            finalUrl: result.finalUrl,
            screenshot: result.screenshot,
            error: result.error,
          };
        } catch (err) {
          return {
            success: false,
            steps: [],
            extractedData: {},
            finalUrl: input.url,
            error: (err as Error).message,
          };
        }
      }),

    closeNavigator: protectedProcedure.mutation(async () => {
      try {
        await webNavigator.close();
        return { success: true };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    }),
  }),

  // ─── Geração de Mídia ───
  media: router({
    generateImage: protectedProcedure
      .input(z.object({
        prompt: z.string(),
        quality: z.enum(["low", "medium", "high"]).optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const imagePath = await mediaGenerator.generateImage(
            input.prompt,
            { quality: input.quality || "medium" }
          );
          return { success: true, imagePath };
        } catch (err) {
          return { success: false, error: (err as Error).message };
        }
      }),

    generateAudio: protectedProcedure
      .input(z.object({
        text: z.string(),
      }))
      .mutation(async ({ input }) => {
        try {
          const audioPath = await mediaGenerator.generateAudio(input.text);
          return { success: true, audioPath };
        } catch (err) {
          return { success: false, error: (err as Error).message };
        }
      }),

    getMediaStatus: publicProcedure.query(() => {
      return mediaGenerator.getStatus();
    }),

    installDependencies: protectedProcedure.mutation(async () => {
      try {
        await mediaGenerator.installDependencies();
        return { success: true };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    }),
  }),
});
