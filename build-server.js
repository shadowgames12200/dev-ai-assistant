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
      external: ['postgres', 'fsevents'],
      loader: {
        '.ts': 'ts',
      },
      banner: {
        js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
    });
    console.log('Build successful');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

runBuild();
