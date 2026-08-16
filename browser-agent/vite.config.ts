import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import staticCopy from 'vite-plugin-static-copy';

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';

  return {
    root: '.',
    publicDir: false,
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      minify: isDev ? false : 'esbuild',
      sourcemap: isDev ? 'inline' : false,
      target: 'chrome109',
      rollupOptions: {
        input: {
          'background/service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
          'content/dom-monitor': resolve(__dirname, 'src/content/dom-monitor.ts'),
          'content/bot-detector': resolve(__dirname, 'src/content/bot-detector.ts'),
          'popup/index': resolve(__dirname, 'src/popup/index.html'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith('.css')) {
              return 'assets/[name]-[hash][extname]';
            }
            return 'assets/[name]-[hash][extname]';
          },
          format: 'es',
        },
      },
      commonjsOptions: {
        include: [],
      },
    },
    plugins: [
      staticCopy({
        targets: [
          { src: 'manifest.json', dest: '.' },
          { src: 'icons', dest: '.', rename: 'icons' },
        ],
      }),
      {
        name: 'copy-manifest',
        writeBundle() {
          // Ensure manifest.json is copied to dist
          const src = resolve(__dirname, 'manifest.json');
          const dest = resolve(__dirname, 'dist/manifest.json');
          if (existsSync(src)) {
            copyFileSync(src, dest);
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'src/shared'),
        '@background': resolve(__dirname, 'src/background'),
        '@content': resolve(__dirname, 'src/content'),
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.EXTENSION_VERSION': JSON.stringify(process.env.npm_package_version || '0.1.0'),
    },
  };
});