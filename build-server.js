import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runBuild() {
  try {
    await build({
      entryPoints: [path.join(__dirname, 'server/_core/index.ts')],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: path.join(__dirname, 'dist/index.js'),
      // Apenas pacotes que sabidamente causam erro ao serem empacotados ou que a Vercel já fornece.
      // Postgres é marcado como externo para usar o driver nativo se necessário.
      external: [
        'postgres',
        'fsevents',
        '@tailwindcss/oxide',
        '@tailwindcss/oxide-linux-x64-musl',
        '@tailwindcss/oxide-linux-x64-gnu',
        '@babel/preset-typescript',
        '@babel/core',
        'lightningcss',
        'vite',
        'rollup',
        '@rollup/rollup-linux-x64-gnu'
      ],
      loader: {
        '.ts': 'ts',
      },
      banner: {
        js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
      // Suprimir avisos de módulos que não podem ser resolvidos estaticamente
      logLevel: 'info',
    });
    console.log('Build successful');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

runBuild();
