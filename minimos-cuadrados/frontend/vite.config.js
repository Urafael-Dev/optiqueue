import { defineConfig } from 'vite';

// En desarrollo, /api se redirige al servidor de Django (python manage.py runserver).
// En producción, define VITE_API_URL con la URL pública del backend.
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.DJANGO_URL || 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
});
