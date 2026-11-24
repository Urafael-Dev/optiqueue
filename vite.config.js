import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';

/**
 * En desarrollo (npm run dev / preview) sirve /api/asistente con el mismo código que
 * la función de Vercel. Lee ANTHROPIC_API_KEY de .env.local o del entorno.
 */
function assistantApi(mode) {
  const attach = async (server) => {
    // Los valores de .env.local mandan (y uno vacío no pisa nada); Vite vuelve a pasar por aquí
    // cada vez que cambia un .env, así que basta con guardar el archivo.
    for (const [k, v] of Object.entries(loadEnv(mode, process.cwd(), ''))) if (v) process.env[k] = v;
    const { handleAssistant } = await import('./server/asistente.js');
    server.middlewares.use('/api/asistente', (req, res) => handleAssistant(req, res));
  };
  return { name: 'optiqueue-asistente', configureServer: attach, configurePreviewServer: attach };
}

export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), assistantApi(mode)],
  base: './', // permite servir dist/ desde cualquier subcarpeta o hosting estático
  build: {
    chunkSizeWarningLimit: 700, // three.js (vista 3D del gemelo) va en su propio chunk, cargado bajo demanda
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        informe: resolve(import.meta.dirname, 'informe.html'),
        resolver: resolve(import.meta.dirname, 'resolver.html'),
      },
    },
  },
  test: { include: ['tests/**/*.test.js'] },
}));
