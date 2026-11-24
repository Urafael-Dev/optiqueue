/** Encabezado de sección uniforme: número, título, descripción y acciones opcionales. */
export function sectionHead({ n, id, title, desc = '', actions = '' }) {
  return `
    <div class="sec-head">
      <div>
        <span class="sec-num">${String(n).padStart(2, '0')}</span>
        <h2 id="${id}" class="sec-title">${title}</h2>
        ${desc ? `<p class="sec-desc">${desc}</p>` : ''}
      </div>
      ${actions ? `<div class="flex items-center gap-4">${actions}</div>` : ''}
    </div>`;
}

export const sub = (base, s) => `${base}<sub>${s}</sub>`;

/**
 * Ciclo de vida de una sección que se puede volver a dibujar (modo exploración).
 * Devuelve una señal que se aborta en el siguiente render del mismo elemento: úsala
 * en addEventListener({ signal }) y con onAbort() para desconectar observadores,
 * destruir gráficos o cancelar suscripciones.
 */
const lifecycles = new WeakMap();
export function lifecycle(el) {
  lifecycles.get(el)?.abort();
  const ac = new AbortController();
  lifecycles.set(el, ac);
  return ac.signal;
}
export const onAbort = (signal, fn) => signal.addEventListener('abort', fn, { once: true });
