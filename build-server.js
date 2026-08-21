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
      external: [
        'postgres', 
        'fsevents', 
        'dotenv', 
        'dotenv/config',
        'express', 
        'cookie-parser', 
        'superjson', 
        'zod', 
        'tsx', 
        'vite',
        '@tailwindcss/vite',
        'tailwindcss',
        'sonner',
        'clsx',
        'tailwind-merge',
        'qrcode',
        '@radix-ui/react-slot',
        '@radix-ui/react-accordion',
        '@radix-ui/react-alert-dialog',
        '@radix-ui/react-aspect-ratio',
        '@radix-ui/react-avatar',
        '@radix-ui/react-checkbox',
        '@radix-ui/react-collapsible',
        '@radix-ui/react-context-menu',
        '@radix-ui/react-dialog',
        '@radix-ui/react-dropdown-menu',
        '@radix-ui/react-hover-card',
        '@radix-ui/react-label',
        '@radix-ui/react-menubar',
        '@radix-ui/react-navigation-menu',
        '@radix-ui/react-popover',
        '@radix-ui/react-progress',
        '@radix-ui/react-radio-group',
        '@radix-ui/react-scroll-area',
        '@radix-ui/react-select',
        '@radix-ui/react-separator',
        '@radix-ui/react-slider',
        '@radix-ui/react-switch',
        '@radix-ui/react-tabs',
        '@radix-ui/react-toggle',
        '@radix-ui/react-toggle-group',
        '@radix-ui/react-tooltip',
        'streamdown',
        'nanoid',
        'wouter',
        '@tanstack/react-query',
        '@trpc/client',
        '@trpc/react-query',
        '@trpc/server',
        'lucide-react',
        '@babel/core',
        '@babel/preset-typescript',
        '@babel/preset-typescript/package.json'
      ],
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
