/**
 * Plugin Loader Module
 * Carrega ferramentas customizadas dinamicamente de um diretório
 * Permite que o usuário adicione scripts sem modificar o código-fonte
 */

import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface CustomTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: any) => Promise<string>;
  language: "javascript" | "python" | "shell";
  filePath: string;
}

class PluginLoader {
  private pluginsDir: string;
  private loadedPlugins: Map<string, CustomTool> = new Map();
  private watchEnabled: boolean = false;

  constructor(pluginsDir: string = "./plugins") {
    this.pluginsDir = path.resolve(pluginsDir);
    this.ensurePluginsDir();
  }

  /**
   * Garante que o diretório de plugins existe
   */
  private ensurePluginsDir(): void {
    if (!fs.existsSync(this.pluginsDir)) {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
      console.log(`[PluginLoader] Diretório de plugins criado: ${this.pluginsDir}`);
    }
  }

  /**
   * Carrega todos os plugins do diretório
   */
  async loadAllPlugins(): Promise<CustomTool[]> {
    this.loadedPlugins.clear();

    try {
      const files = fs.readdirSync(this.pluginsDir);

      for (const file of files) {
        if (file.startsWith(".") || file === "README.md") continue;

        const filePath = path.join(this.pluginsDir, file);
        const stat = fs.statSync(filePath);

        if (stat.isFile()) {
          try {
            const tool = await this.loadPlugin(filePath);
            if (tool) {
              this.loadedPlugins.set(tool.name, tool);
              console.log(`[PluginLoader] Plugin carregado: ${tool.name}`);
            }
          } catch (err) {
            console.error(`[PluginLoader] Erro ao carregar ${file}:`, err);
          }
        }
      }
    } catch (err) {
      console.error("[PluginLoader] Erro ao ler diretório de plugins:", err);
    }

    return Array.from(this.loadedPlugins.values());
  }

  /**
   * Carrega um plugin individual
   */
  private async loadPlugin(filePath: string): Promise<CustomTool | null> {
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, "utf-8");

    // Extrair metadados do comentário no topo do arquivo
    const metadataMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
    if (!metadataMatch) {
      console.warn(`[PluginLoader] ${filePath} não tem metadados`);
      return null;
    }

    try {
      const metadata = JSON.parse(metadataMatch[1].replace(/\*/g, "").trim());

      let language: "javascript" | "python" | "shell" = "shell";
      if (ext === ".js" || ext === ".mjs") language = "javascript";
      if (ext === ".py") language = "python";

      const handler = async (args: any): Promise<string> => {
        return await this.executePlugin(filePath, args, language);
      };

      return {
        name: metadata.name || path.basename(filePath, ext),
        description: metadata.description || "Plugin customizado",
        parameters: metadata.parameters || {
          type: "object",
          properties: {},
        },
        handler,
        language,
        filePath,
      };
    } catch (err) {
      console.error(`[PluginLoader] Erro ao parsear metadados de ${filePath}:`, err);
      return null;
    }
  }

  /**
   * Executa um plugin
   */
  private async executePlugin(
    filePath: string,
    args: any,
    language: "javascript" | "python" | "shell"
  ): Promise<string> {
    try {
      if (language === "javascript") {
        // Para JS, importar dinamicamente
        const module = await import(`file://${filePath}`);
        const result = await module.default(args);
        return typeof result === "string" ? result : JSON.stringify(result);
      }

      if (language === "python") {
        const argsJson = JSON.stringify(args);
        const { stdout, stderr } = await execAsync(
          `python3 "${filePath}" '${argsJson}'`
        );
        return stdout || stderr;
      }

      if (language === "shell") {
        const { stdout, stderr } = await execAsync(`bash "${filePath}"`, {
          env: { ...process.env, PLUGIN_ARGS: JSON.stringify(args) },
        });
        return stdout || stderr;
      }

      return "Linguagem não suportada";
    } catch (err) {
      return `Erro ao executar plugin: ${(err as Error).message}`;
    }
  }

  /**
   * Obtém todos os plugins carregados
   */
  getLoadedPlugins(): CustomTool[] {
    return Array.from(this.loadedPlugins.values());
  }

  /**
   * Obtém um plugin específico
   */
  getPlugin(name: string): CustomTool | undefined {
    return this.loadedPlugins.get(name);
  }

  /**
   * Executa um plugin pelo nome
   */
  async executePlugin(name: string, args: any): Promise<string> {
    const plugin = this.loadedPlugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin não encontrado: ${name}`);
    }
    return await plugin.handler(args);
  }

  /**
   * Monitora mudanças no diretório de plugins
   */
  watchPlugins(): void {
    if (this.watchEnabled) return;

    this.watchEnabled = true;
    fs.watch(this.pluginsDir, async (eventType, filename) => {
      if (filename && !filename.startsWith(".")) {
        console.log(`[PluginLoader] Mudança detectada: ${filename}`);
        await this.loadAllPlugins();
      }
    });

    console.log(`[PluginLoader] Monitorando mudanças em: ${this.pluginsDir}`);
  }

  /**
   * Cria um arquivo de exemplo de plugin
   */
  createExamplePlugin(): void {
    const examplePath = path.join(this.pluginsDir, "example-plugin.js");

    if (fs.existsSync(examplePath)) {
      console.log("[PluginLoader] Arquivo de exemplo já existe");
      return;
    }

    const exampleContent = `/**
{
  "name": "weather",
  "description": "Obtém informações do tempo (exemplo)",
  "parameters": {
    "type": "object",
    "properties": {
      "city": { "type": "string", "description": "Nome da cidade" }
    },
    "required": ["city"]
  }
}
*/

export default async function weatherPlugin(args) {
  const { city } = args;
  // Simular uma chamada à API de tempo
  return \`Tempo em \${city}: Ensolarado, 25°C\`;
}
`;

    fs.writeFileSync(examplePath, exampleContent);
    console.log(`[PluginLoader] Arquivo de exemplo criado: ${examplePath}`);
  }
}

export const pluginLoader = new PluginLoader(
  process.env.PLUGINS_DIR || "./plugins"
);

/**
 * Inicializa o carregador de plugins
 */
export async function initializePlugins(): Promise<CustomTool[]> {
  const plugins = await pluginLoader.loadAllPlugins();
  pluginLoader.watchPlugins();
  pluginLoader.createExamplePlugin();
  console.log(`[PluginLoader] ${plugins.length} plugins carregados`);
  return plugins;
}
