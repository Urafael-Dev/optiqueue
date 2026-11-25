// Cliente del backend de Django.
// En desarrollo Vite redirige /api al puerto 8000; en producción usa VITE_API_URL.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function pedir(ruta, opciones = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/api${ruta}`, {
      headers: { 'Content-Type': 'application/json' },
      ...opciones,
    });
  } catch {
    throw new Error('No se pudo conectar con el backend. ¿Está corriendo «python manage.py runserver»?');
  }
  let datos = null;
  try {
    datos = await res.json();
  } catch {
    /* respuesta sin JSON */
  }
  if (!res.ok) throw new Error(datos?.error || `Error ${res.status} del servidor.`);
  return datos;
}

const post = (ruta, cuerpo) => pedir(ruta, { method: 'POST', body: JSON.stringify(cuerpo) });

export const api = {
  estado: () => pedir('/'),
  ejemplos: () => pedir('/ejemplos/'),
  resolver: (A, b) => post('/sistemas/resolver/', { A, b }),
  ajustar: (datos) => post('/ajuste/', datos),
  historial: () => pedir('/historial/'),
  preguntas: () => pedir('/quiz/preguntas/'),
  enviarQuiz: (datos) => post('/quiz/enviar/', datos),
  ranking: () => pedir('/quiz/ranking/'),
};
