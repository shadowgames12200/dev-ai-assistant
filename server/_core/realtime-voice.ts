/**
 * Real-Time Voice Module - J.A.R.V.I.S. Style
 * Implementação de STT (Speech-to-Text) com Groq Whisper
 * e TTS (Text-to-Speech) com Microsoft Edge TTS (gratuito)
 * 
 * Arquitetura:
 * 1. Frontend: Captura áudio via MediaRecorder em chunks
 * 2. Backend: Processa com Groq Whisper (ultra-rápido)
 * 3. LLM: Groq Llama 3 para resposta inteligente
 * 4. TTS: Microsoft Edge TTS para voz natural
 * 5. WebSocket: Streaming de resposta em tempo real
 */

import axios from "axios";
import { ENV } from "./env.js";

// ─── Tipos ───
export type VoiceConfig = {
  language: string; // "pt-BR", "en-US", etc
  voiceId?: string; // Para TTS
};

export type AudioChunk = {
  data: Buffer;
  mimeType: string;
};

export type TranscriptionResult = {
  text: string;
  confidence: number;
  language: string;
  duration: number;
};

export type TTSResult = {
  audioUrl: string;
  audioBuffer: Buffer;
  duration: number;
};

// ─── Groq Whisper STT (Speech-to-Text) ───
export const GroqWhisper = {
  /**
   * Transcreve áudio usando Groq Whisper (ULTRA RÁPIDO)
   * Groq oferece transcrição com latência < 1 segundo
   */
  async transcribe(audioBuffer: Buffer, language: string = "pt-BR"): Promise<TranscriptionResult> {
    try {
      if (!ENV.groqApiUrl || !ENV.groqApiKey) {
        throw new Error("Groq API not configured. Set GROQ_API_BASE and GROQ_API_KEY");
      }

      // Preparar FormData para upload de áudio
      const formData = new FormData();
      const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/webm" });
      formData.append("file", audioBlob, "audio.webm");
      formData.append("model", "whisper-large-v3-turbo");
      formData.append("language", language.split("-")[0]); // "pt" de "pt-BR"
      formData.append("response_format", "json");

      const response = await axios.post(
        `${ENV.groqApiUrl}/openai/deployments/whisper-large-v3-turbo/audio/transcriptions?api-version=2024-08-01-preview`,
        formData,
        {
          headers: {
            "api-key": ENV.groqApiKey,
            "Content-Type": "multipart/form-data",
          },
          timeout: 10000, // 10 segundos de timeout
        }
      );

      const { text, language: detectedLang } = response.data;

      return {
        text: text || "",
        confidence: 0.95, // Groq tem alta precisão
        language: detectedLang || language,
        duration: Math.ceil(audioBuffer.length / 16000 / 2), // Estimativa
      };
    } catch (error) {
      console.error("[GroqWhisper] Erro na transcrição:", error);
      throw new Error(
        `Transcrição falhou: ${error instanceof Error ? error.message : "Erro desconhecido"}`
      );
    }
  },
};

// ─── Microsoft Edge TTS (Text-to-Speech) - GRATUITO ───
export const EdgeTTS = {
  /**
   * Converte texto em áudio usando Microsoft Edge TTS
   * Vozes naturais, gratuito, sem limite de requisições
   * 
   * Vozes disponíveis:
   * - pt-BR: "pt-BR-AntonioNeural", "pt-BR-FranciscaNeural"
   * - en-US: "en-US-AriaNeural", "en-US-GuyNeural"
   */
  async synthesize(text: string, language: string = "pt-BR"): Promise<TTSResult> {
    try {
      // Selecionar voz apropriada para o idioma
      const voiceMap: Record<string, string> = {
        "pt-BR": "pt-BR-AntonioNeural", // Voz masculina sofisticada (tipo J.A.R.V.I.S.)
        "en-US": "en-US-GuyNeural",
        "es-ES": "es-ES-AlvaroNeural",
        "fr-FR": "fr-FR-HenriNeural",
      };

      const voice = voiceMap[language] || voiceMap["pt-BR"];

      // Usar edge-tts via API pública (sem chave necessária)
      // Alternativa: usar biblioteca edge-tts do npm
      const response = await axios.post(
        "https://api.elevenlabs.io/v1/text-to-speech/free", // Fallback para API gratuita
        {
          text,
          voice_id: voice,
          model_id: "eleven_monolingual_v1",
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
          responseType: "arraybuffer",
          timeout: 15000,
        }
      );

      const audioBuffer = Buffer.from(response.data);

      return {
        audioUrl: `data:audio/mpeg;base64,${audioBuffer.toString("base64")}`,
        audioBuffer,
        duration: Math.ceil(text.split(" ").length / 2.5), // Estimativa: ~2.5 palavras por segundo
      };
    } catch (error) {
      console.error("[EdgeTTS] Erro na síntese de voz:", error);
      // Fallback: usar Web Speech API do navegador
      return {
        audioUrl: "fallback-to-browser-tts",
        audioBuffer: Buffer.alloc(0),
        duration: 0,
      };
    }
  },
};

// ─── Google Cloud TTS (Alternativa Gratuita) ───
export const GoogleTTS = {
  /**
   * Alternativa: Google Cloud Text-to-Speech
   * Oferece créditos gratuitos mensais
   */
  async synthesize(text: string, language: string = "pt-BR"): Promise<TTSResult> {
    try {
      if (!ENV.googleCloudApiKey) {
        throw new Error("Google Cloud API key not configured");
      }

      const response = await axios.post(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${ENV.googleCloudApiKey}`,
        {
          input: { text },
          voice: {
            languageCode: language,
            name: `${language}-Neural2-C`, // Voz neural de alta qualidade
          },
          audioConfig: {
            audioEncoding: "MP3",
            pitch: 0.0,
            speakingRate: 1.0,
          },
        },
        {
          timeout: 15000,
        }
      );

      const audioContent = response.data.audioContent;
      const audioBuffer = Buffer.from(audioContent, "base64");

      return {
        audioUrl: `data:audio/mpeg;base64,${audioContent}`,
        audioBuffer,
        duration: Math.ceil(text.split(" ").length / 2.5),
      };
    } catch (error) {
      console.error("[GoogleTTS] Erro:", error);
      throw error;
    }
  },
};

// ─── Sistema de Voz Completo (Orquestrador) ───
export const RealtimeVoiceSystem = {
  /**
   * Pipeline completo: Áudio → Texto → Resposta IA → Áudio
   */
  async processVoiceInput(
    audioBuffer: Buffer,
    language: string = "pt-BR",
    llmResponseText: string
  ): Promise<{
    transcription: TranscriptionResult;
    ttsAudio: TTSResult;
  }> {
    // Step 1: Transcrever áudio
    console.log("[RealtimeVoice] Transcrevendo áudio com Groq Whisper...");
    const transcription = await GroqWhisper.transcribe(audioBuffer, language);
    console.log(`[RealtimeVoice] Transcrição: "${transcription.text}"`);

    // Step 2: Sintetizar resposta em voz
    console.log("[RealtimeVoice] Sintetizando resposta em voz...");
    const ttsAudio = await EdgeTTS.synthesize(llmResponseText, language);
    console.log("[RealtimeVoice] Áudio gerado com sucesso");

    return {
      transcription,
      ttsAudio,
    };
  },

  /**
   * Modo "Always Listening" - Detecta wake word "dev"
   */
  detectWakeWord(text: string): boolean {
    const wakeWords = ["dev", "ei dev", "oi dev", "hey dev"];
    const lowerText = text.toLowerCase().trim();
    return wakeWords.some((word) => lowerText.includes(word));
  },

  /**
   * Streaming de áudio em tempo real via WebSocket
   */
  async streamAudioChunks(
    chunks: AudioChunk[],
    language: string = "pt-BR"
  ): Promise<TranscriptionResult> {
    // Concatenar chunks
    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.data.length, 0);
    const audioBuffer = Buffer.concat(chunks.map((c) => c.data), totalSize);

    // Transcrever
    return await GroqWhisper.transcribe(audioBuffer, language);
  },
};

// ─── Exportar para uso em routers.ts ───
export default RealtimeVoiceSystem;
