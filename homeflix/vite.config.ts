/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/**
 * Apps Tizen rodam a partir de file://, onde <script type="module"> é bloqueado
 * (origem "null"). O build gera um único bundle IIFE e este plugin troca a tag
 * por um <script defer> clássico, além de incluir a biblioteca webapis (AVPlay),
 * que só existe na TV.
 */
function tizenHtml(): Plugin {
  return {
    name: 'homeflix-tizen-html',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, '<script defer src="$1"></script>')
        .replace(/ crossorigin(?=[ >])/g, '')
        .replace('<!-- tizen:webapis -->', '<script src="$WEBAPIS/webapis/webapis.js"></script>');
    },
  };
}

const backend = process.env.HOMEFLIX_BACKEND ?? 'http://localhost:8080';
const version = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [tizenHtml()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Q60C (2023) = Tizen 7.0 / Chromium 94. Chromium 85 cobre também TVs Tizen 6.5 (2022).
    target: 'chrome85',
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'app.js',
        assetFileNames: '[name][extname]',
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    // No navegador, o app usa a mesma origem e o Vite repassa a API ao backend (sem CORS).
    proxy: { '/api': backend, '/health': backend },
  },
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
  },
});
