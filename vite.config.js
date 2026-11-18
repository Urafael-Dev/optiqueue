import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  base: './', // permite servir dist/ desde cualquier subcarpeta o hosting estático
  test: { include: ['tests/**/*.test.js'] },
});
