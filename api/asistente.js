import { handleAssistant } from '../server/asistente.js';

/** Función de Vercel: POST /api/asistente (la clave va en la variable de entorno ANTHROPIC_API_KEY). */
export default function handler(req, res) {
  return handleAssistant(req, res);
}
