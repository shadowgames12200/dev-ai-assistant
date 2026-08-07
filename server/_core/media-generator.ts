/**
 * Media Generator Module
 * Gera imagens, vídeos e áudio localmente usando modelos open-source
 * Suporta Stable Diffusion, Bark e FFmpeg
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const execAsync = promisify(exec);

export interface GenerationConfig {
  quality: "low" | "medium" | "high";
  format: string;
  timeout: number;
}

class MediaGenerator {
  private outputDir: string;
  private hasStableDiffusion: boolean = false;
  private hasBark: boolean = false;
  private hasFFmpeg: boolean = false;

  constructor(outputDir: string = "./generated-media") {
    this.outputDir = path.resolve(outputDir);
    this.ensureOutputDir();
    this.checkDependencies();
  }

  /**
   * Garante que o diretório de saída existe
   */
  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Verifica quais ferramentas estão disponíveis
   */
  private async checkDependencies(): Promise<void> {
    try {
      await execAsync("which ffmpeg");
      this.hasFFmpeg = true;
      console.log("[MediaGenerator] FFmpeg disponível");
    } catch {
      console.warn("[MediaGenerator] FFmpeg não encontrado");
    }

    // Verificar Stable Diffusion (via Python)
    try {
      await execAsync("python3 -c 'import diffusers'");
      this.hasStableDiffusion = true;
      console.log("[MediaGenerator] Stable Diffusion disponível");
    } catch {
      console.warn("[MediaGenerator] Stable Diffusion não instalado");
    }

    // Verificar Bark (via Python)
    try {
      await execAsync("python3 -c 'import bark'");
      this.hasBark = true;
      console.log("[MediaGenerator] Bark disponível");
    } catch {
      console.warn("[MediaGenerator] Bark não instalado");
    }
  }

  /**
   * Gera uma imagem usando Stable Diffusion
   */
  async generateImage(
    prompt: string,
    config: Partial<GenerationConfig> = {}
  ): Promise<string> {
    if (!this.hasStableDiffusion) {
      throw new Error("Stable Diffusion não está instalado. Execute: pip install diffusers torch");
    }

    const finalConfig = {
      quality: config.quality || "medium",
      format: "png",
      timeout: config.timeout || 120000,
    };

    const steps = finalConfig.quality === "low" ? 20 : finalConfig.quality === "medium" ? 50 : 100;
    const outputPath = path.join(this.outputDir, `image-${Date.now()}.png`);

    const pythonScript = `
import torch
from diffusers import StableDiffusionPipeline

# Usar modelo otimizado para velocidade
model_id = "runwayml/stable-diffusion-v1-5"
pipe = StableDiffusionPipeline.from_pretrained(model_id, torch_dtype=torch.float16)
pipe = pipe.to("cpu")  # Usar CPU se GPU não disponível

image = pipe(
    prompt="${prompt}",
    num_inference_steps=${steps},
    guidance_scale=7.5
).images[0]

image.save("${outputPath}")
print("Imagem gerada com sucesso")
`;

    try {
      await execAsync(`python3 -c "${pythonScript}"`, {
        timeout: finalConfig.timeout,
      });
      console.log(`[MediaGenerator] Imagem gerada: ${outputPath}`);
      return outputPath;
    } catch (err) {
      console.error("[MediaGenerator] Erro ao gerar imagem:", err);
      throw err;
    }
  }

  /**
   * Gera áudio usando Bark
   */
  async generateAudio(
    text: string,
    config: Partial<GenerationConfig> = {}
  ): Promise<string> {
    if (!this.hasBark) {
      throw new Error("Bark não está instalado. Execute: pip install bark");
    }

    const outputPath = path.join(this.outputDir, `audio-${Date.now()}.wav`);

    const pythonScript = `
from bark import SAMPLE_RATE, generate_audio, preload_models
import scipy.io.wavfile as wavfile

preload_models()
audio_array = generate_audio("${text}", history_prompt="pt_BR")
wavfile.write("${outputPath}", SAMPLE_RATE, audio_array)
print("Áudio gerado com sucesso")
`;

    try {
      await execAsync(`python3 -c "${pythonScript}"`, {
        timeout: config.timeout || 60000,
      });
      console.log(`[MediaGenerator] Áudio gerado: ${outputPath}`);
      return outputPath;
    } catch (err) {
      console.error("[MediaGenerator] Erro ao gerar áudio:", err);
      throw err;
    }
  }

  /**
   * Cria um vídeo simples a partir de imagens
   */
  async createVideoFromImages(
    imagePaths: string[],
    outputPath: string,
    fps: number = 30
  ): Promise<string> {
    if (!this.hasFFmpeg) {
      throw new Error("FFmpeg não está instalado");
    }

    const finalOutputPath = path.join(this.outputDir, outputPath);

    try {
      // Criar lista de imagens para FFmpeg
      const listFile = path.join(this.outputDir, "images.txt");
      const listContent = imagePaths.map(img => `file '${img}'`).join("\n");
      fs.writeFileSync(listFile, listContent);

      await execAsync(
        `ffmpeg -f concat -safe 0 -i "${listFile}" -c:v libx264 -pix_fmt yuv420p -r ${fps} "${finalOutputPath}"`,
        { timeout: 120000 }
      );

      fs.unlinkSync(listFile);
      console.log(`[MediaGenerator] Vídeo criado: ${finalOutputPath}`);
      return finalOutputPath;
    } catch (err) {
      console.error("[MediaGenerator] Erro ao criar vídeo:", err);
      throw err;
    }
  }

  /**
   * Converte áudio entre formatos
   */
  async convertAudio(
    inputPath: string,
    outputFormat: "mp3" | "wav" | "ogg" = "mp3"
  ): Promise<string> {
    if (!this.hasFFmpeg) {
      throw new Error("FFmpeg não está instalado");
    }

    const outputPath = path.join(
      this.outputDir,
      `audio-${Date.now()}.${outputFormat}`
    );

    try {
      await execAsync(
        `ffmpeg -i "${inputPath}" -q:a 0 -map a "${outputPath}"`,
        { timeout: 30000 }
      );
      console.log(`[MediaGenerator] Áudio convertido: ${outputPath}`);
      return outputPath;
    } catch (err) {
      console.error("[MediaGenerator] Erro ao converter áudio:", err);
      throw err;
    }
  }

  /**
   * Obtém informações sobre o status das ferramentas
   */
  getStatus(): {
    stableDiffusion: boolean;
    bark: boolean;
    ffmpeg: boolean;
  } {
    return {
      stableDiffusion: this.hasStableDiffusion,
      bark: this.hasBark,
      ffmpeg: this.hasFFmpeg,
    };
  }

  /**
   * Instala dependências Python
   */
  async installDependencies(): Promise<void> {
    console.log("[MediaGenerator] Instalando dependências...");

    try {
      await execAsync("pip install diffusers torch bark scipy", {
        timeout: 300000, // 5 minutos
      });
      console.log("[MediaGenerator] Dependências instaladas com sucesso");
      await this.checkDependencies();
    } catch (err) {
      console.error("[MediaGenerator] Erro ao instalar dependências:", err);
      throw err;
    }
  }
}

export const mediaGenerator = new MediaGenerator(
  process.env.MEDIA_OUTPUT_DIR || "./generated-media"
);

/**
 * Wrappers para geração de mídia
 */
export async function generateImage(
  prompt: string,
  quality: "low" | "medium" | "high" = "medium"
): Promise<string> {
  return await mediaGenerator.generateImage(prompt, { quality });
}

export async function generateAudio(text: string): Promise<string> {
  return await mediaGenerator.generateAudio(text);
}
