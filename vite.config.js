import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  base: './', // permite servir dist/ desde cualquier subcarpeta o hosting estático
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        informe: resolve(import.meta.dirname, 'informe.html'),
      },
    },
  },
  test: { include: ['tests/**/*.test.js'] },
});
