import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/** Бандл module plan-fact → js/dist/plan-fact.js (ES module). */
export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: 'js/dist',
    lib: {
      entry: resolve(root, 'src/modules/plan-fact/index.ts'),
      name: 'RBIPlanFact',
      formats: ['es'],
      fileName: () => 'plan-fact.js'
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    },
    minify: false,
    sourcemap: true
  }
});
