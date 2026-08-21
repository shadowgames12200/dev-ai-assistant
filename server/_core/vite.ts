import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";

export async function setupVite(app: Express, server: Server) {
  // Em produção, não fazemos nada e evitamos qualquer importação do Vite
  if (process.env.NODE_ENV === "production") return;
  
  try {
    // Usamos nomes de módulos em variáveis para evitar análise estática do esbuild/vercel
    const viteModuleName = "vite";
    const configPath = "../../vite.config.ts";
    
    // Dynamic import usando nomes dinâmicos para "enganar" o bundler
    const { createServer: createViteServer } = await import(viteModuleName);
    // @ts-ignore
    const viteConfigModule = await import(configPath);
    const viteConfig = viteConfigModule.default;

    const serverOptions = {
      middlewareMode: true,
      hmr: { server },
      allowedHosts: true as const,
    };

    const vite = await createViteServer({
      ...viteConfig,
      configFile: false,
      server: serverOptions,
      appType: "custom",
    });

    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;

      try {
        const clientTemplate = path.resolve(
          import.meta.dirname,
          "../..",
          "client",
          "index.html"
        );

        // always reload the index.html file from disk incase it changes
        let template = await fs.promises.readFile(clientTemplate, "utf-8");
        template = template.replace(
          `src="/src/main.tsx"`,
          `src="/src/main.tsx?v=${nanoid()}"`
        );
        const page = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(page);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } catch (err) {
    console.error("Failed to setup Vite:", err);
  }
}

export function serveStatic(app: any) {
  const distPath = path.resolve(import.meta.dirname, "../../dist/public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req: any, res: any) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
