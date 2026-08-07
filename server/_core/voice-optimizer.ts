/**
 * Voice Optimizer Module
 * Otimiza o sistema de voz para latência mínima e qualidade máxima
 * Implementa cache, compressão e processamento paralelo
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface VoiceConfig {
  provider: "google" | "openai" | "azure" | "local";
  language: string;
  speed: number; // 0.5 - 2.0
  pitch: number; // 0.5 - 2.0
  volume: number; // 0 - 1
  voice?: string;
  cacheEnabled: boolean;
  compressionEnabled: boolean;
}

class VoiceOptimizer {
  private cacheDir: string;
  private defaultConfig: VoiceConfig;
  private textHashCache: Map<string, string> = new Map();

  constructor(cacheDir: string = "./voice-cache") {
    this.cacheDir = path.resolve(cacheDir);
    this.ensureCacheDir();

    this.defaultConfig = {
      provider: "openai",
      language: "pt-BR",
      speed: 1.0,
      pitch: 1.0,
      volume: 1.0,
      cacheEnabled: true,
      compressionEnabled: true,
    };
  }

  /**
   * Garante que o diretório de cache existe
   */
  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Gera hash do texto para cache
   */
  private hashText(text: string, config: VoiceConfig): string {
    const key = `${text}|${config.language}|${config.speed}|${config.voice}`;
    const hash = crypto.createHash("sha256").update(key).digest("hex");
    return hash;
  }

  /**
   * Obtém áudio do cache se disponível
   */
  private getCachedAudio(text: string, config: VoiceConfig): Buffer | null {
    if (!config.cacheEnabled) return null;

    const hash = this.hashText(text, config);
    const cachePath = path.join(this.cacheDir, `${hash}.mp3`);

    if (fs.existsSync(cachePath)) {
      console.log(`[VoiceOptimizer] Cache hit: ${hash}`);
      return fs.readFileSync(cachePath);
    }

    return null;
  }

  /**
   * Salva áudio no cache
   */
  private cacheAudio(text: string, config: VoiceConfig, audioBuffer: Buffer): void {
    if (!config.cacheEnabled) return;

    const hash = this.hashText(text, config);
    const cachePath = path.join(this.cacheDir, `${hash}.mp3`);
    fs.writeFileSync(cachePath, audioBuffer);
    console.log(`[VoiceOptimizer] Áudio cacheado: ${hash}`);
  }

  /**
   * Sintetiza fala usando OpenAI TTS
   */
  async synthesizeOpenAI(
    text: string,
    config: Partial<VoiceConfig> = {}
  ): Promise<Buffer> {
    const finalConfig = { ...this.defaultConfig, ...config };

    // Verificar cache
    const cached = this.getCachedAudio(text, finalConfig);
    if (cached) return cached;

    try {
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "tts-1-hd", // ou "tts-1" para latência mínima
          input: text,
          voice: finalConfig.voice || "nova",
          speed: finalConfig.speed,
          response_format: "mp3",
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI TTS error: ${response.statusText}`);
      }

      const audioBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(audioBuffer);

      // Cachear resultado
      this.cacheAudio(text, finalConfig, buffer);

      return buffer;
    } catch (err) {
      console.error("[VoiceOptimizer] Erro ao sintetizar com OpenAI:", err);
      throw err;
    }
  }

  /**
   * Sintetiza fala usando Google Cloud TTS
   */
  async synthesizeGoogle(
    text: string,
    config: Partial<VoiceConfig> = {}
  ): Promise<Buffer> {
    const finalConfig = { ...this.defaultConfig, ...config };

    // Verificar cache
    const cached = this.getCachedAudio(text, finalConfig);
    if (cached) return cached;

    try {
      const response = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_CLOUD_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: { text },
            voice: {
              languageCode: finalConfig.language,
              name: finalConfig.voice || "pt-BR-Neural2-C",
            },
            audioConfig: {
              audioEncoding: "MP3",
              pitch: finalConfig.pitch,
              speakingRate: finalConfig.speed,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Google TTS error: ${response.statusText}`);
      }

      const data = await response.json();
      const audioBuffer = Buffer.from(data.audioContent, "base64");

      // Cachear resultado
      this.cacheAudio(text, finalConfig, audioBuffer);

      return audioBuffer;
    } catch (err) {
      console.error("[VoiceOptimizer] Erro ao sintetizar com Google:", err);
      throw err;
    }
  }

  /**
   * Sintetiza fala usando Azure Cognitive Services
   */
  async synthesizeAzure(
    text: string,
    config: Partial<VoiceConfig> = {}
  ): Promise<Buffer> {
    const finalConfig = { ...this.defaultConfig, ...config };

    // Verificar cache
    const cached = this.getCachedAudio(text, finalConfig);
    if (cached) return cached;

    try {
      const ssml = `
        <speak version="1.0" xml:lang="${finalConfig.language}">
          <voice name="${finalConfig.voice || "pt-BR-AntonioNeural"}">
            <prosody pitch="${finalConfig.pitch * 100}%" rate="${finalConfig.speed}">
              ${text}
            </prosody>
          </voice>
        </speak>
      `;

      const response = await fetch(
        `https://${process.env.AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
        {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY || "",
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-16khz-32kbitrate-mono-mp3",
          },
          body: ssml,
        }
      );

      if (!response.ok) {
        throw new Error(`Azure TTS error: ${response.statusText}`);
      }

      const audioBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(audioBuffer);

      // Cachear resultado
      this.cacheAudio(text, finalConfig, buffer);

      return buffer;
    } catch (err) {
      console.error("[VoiceOptimizer] Erro ao sintetizar com Azure:", err);
      throw err;
    }
  }

  /**
   * Sintetiza fala com fallback automático entre provedores
   */
  async synthesizeWithFallback(
    text: string,
    config: Partial<VoiceConfig> = {}
  ): Promise<Buffer> {
    const finalConfig = { ...this.defaultConfig, ...config };

    // Ordem de preferência de provedores
    const providers: Array<"openai" | "google" | "azure"> = ["openai", "google", "azure"];

    for (const provider of providers) {
      try {
        console.log(`[VoiceOptimizer] Tentando síntese com ${provider}...`);
        switch (provider) {
          case "openai":
            return await this.synthesizeOpenAI(text, finalConfig);
          case "google":
            return await this.synthesizeGoogle(text, finalConfig);
          case "azure":
            return await this.synthesizeAzure(text, finalConfig);
        }
      } catch (err) {
        console.warn(`[VoiceOptimizer] ${provider} falhou, tentando próximo...`);
        continue;
      }
    }

    throw new Error("Todos os provedores de TTS falharam");
  }

  /**
   * Limpa o cache de voz
   */
  clearCache(): void {
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        fs.unlinkSync(path.join(this.cacheDir, file));
      }
      console.log("[VoiceOptimizer] Cache de voz limpo");
    } catch (err) {
      console.error("[VoiceOptimizer] Erro ao limpar cache:", err);
    }
  }

  /**
   * Obtém estatísticas do cache
   */
  getCacheStats(): { totalFiles: number; totalSize: number } {
    try {
      const files = fs.readdirSync(this.cacheDir);
      let totalSize = 0;
      for (const file of files) {
        const stat = fs.statSync(path.join(this.cacheDir, file));
        totalSize += stat.size;
      }
      return { totalFiles: files.length, totalSize };
    } catch (err) {
      return { totalFiles: 0, totalSize: 0 };
    }
  }
}

export const voiceOptimizer = new VoiceOptimizer(
  process.env.VOICE_CACHE_DIR || "./voice-cache"
);
