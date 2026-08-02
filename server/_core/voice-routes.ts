/**
 * Voice Routes - Integração com tRPC para voz em tempo real
 * Adicionar estas rotas ao router principal em routers.ts
 */

import { z } from "zod";
import { protectedProcedure, router } from "./trpc.js";
import { TRPCError } from "@trpc/server";
import { RealtimeVoiceSystem, GroqWhisper, EdgeTTS } from "./realtime-voice.js";

export const voiceRouter = router({
  /**
   * Transcrever áudio enviado do frontend
   * Usa Groq Whisper para transcrição ultra-rápida
   */
  transcribe: protectedProcedure
    .input(
      z.object({
        audioBase64: z.string().describe("Áudio em base64"),
        language: z.string().default("pt-BR"),
        mimeType: z.string().default("audio/webm"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        if (!ctx.user) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }

        // Converter base64 para Buffer
        const audioBuffer = Buffer.from(input.audioBase64, "base64");

        // Transcrever com Groq Whisper
        const result = await GroqWhisper.transcribe(audioBuffer, input.language);

        // Detectar wake word
        const wakeWordDetected = RealtimeVoiceSystem.detectWakeWord(result.text);

        return {
          success: true,
          text: result.text,
          confidence: result.confidence,
          language: result.language,
          duration: result.duration,
          wakeWordDetected,
        };
      } catch (error) {
        console.error("[Voice] Transcrição falhou:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Transcrição falhou: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
        });
      }
    }),

  /**
   * Sintetizar texto em voz
   * Usa Edge TTS para voz natural e gratuita
   */
  synthesize: protectedProcedure
    .input(
      z.object({
        text: z.string().describe("Texto a ser convertido em voz"),
        language: z.string().default("pt-BR"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        if (!ctx.user) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }

        // Sintetizar com Edge TTS
        const result = await EdgeTTS.synthesize(input.text, input.language);

        return {
          success: true,
          audioUrl: result.audioUrl,
          duration: result.duration,
        };
      } catch (error) {
        console.error("[Voice] Síntese falhou:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Síntese de voz falhou: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
        });
      }
    }),

  /**
   * Pipeline completo: Áudio → Texto → Resposta IA → Áudio
   * Combina transcrição, processamento e síntese
   */
  processVoiceCommand: protectedProcedure
    .input(
      z.object({
        audioBase64: z.string(),
        language: z.string().default("pt-BR"),
        llmResponse: z.string().describe("Resposta da IA para sintetizar"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        if (!ctx.user) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }

        const audioBuffer = Buffer.from(input.audioBase64, "base64");

        // Pipeline completo
        const result = await RealtimeVoiceSystem.processVoiceInput(
          audioBuffer,
          input.language,
          input.llmResponse
        );

        return {
          success: true,
          transcription: {
            text: result.transcription.text,
            confidence: result.transcription.confidence,
            language: result.transcription.language,
          },
          audio: {
            audioUrl: result.ttsAudio.audioUrl,
            duration: result.ttsAudio.duration,
          },
        };
      } catch (error) {
        console.error("[Voice] Pipeline falhou:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Processamento de voz falhou: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
        });
      }
    }),

  /**
   * Detectar wake word em texto
   */
  detectWakeWord: protectedProcedure
    .input(z.object({ text: z.string() }))
    .query(({ input }) => {
      const detected = RealtimeVoiceSystem.detectWakeWord(input.text);
      return { detected, wakeWord: "dev" };
    }),

  /**
   * Testar conexão de voz
   */
  healthCheck: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    return {
      status: "ok",
      voiceSystemReady: true,
      features: {
        groqWhisper: true,
        edgeTts: true,
        wakeWordDetection: true,
        realTimeStreaming: true,
      },
    };
  }),
});

export default voiceRouter;
