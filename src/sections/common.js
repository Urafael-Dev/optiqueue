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
