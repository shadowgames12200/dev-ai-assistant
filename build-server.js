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
      target: 'node20',
      outfile: path.join(__dirname, 'dist/index.js'),
      mainFields: ['module', 'main'],
      banner: {
        js: `
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
`,
      },
      external: [
        'path',
        'fs',
        'http',
        'https',
        'net',
        'url',
        'crypto',
        'stream',
        'util',
        'os',
        'events',
        'zlib',
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
        'esbuild'
      ],
      loader: {
        '.ts': 'ts',
      },
      logLevel: 'info',
    });
    console.log('Build successful');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

runBuild();
