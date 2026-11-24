import 'katex/dist/katex.min.css';
import { tex, buildSteps, buildModelRows } from '../lib/formulas.js';
import { lifecycle, onAbort, sectionHead } from './common.js';

export function renderFormulation(el, P, opt) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const options = opt.feasible.map((s) => s.c);
  let x = opt.x;
  const modelRows = buildModelRows(P, opt);

  el.innerHTML = `
    ${sectionHead({
      n: 8,
      id: 'h-formulacion',
      title: 'Modelo matemático',
      desc: 'Fórmulas del sistema M/M/c y su valor para el número de ventanillas que elijas. Cada paso se revela al llegar a él.',
      actions: `
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm text-slate-500">Sustituir con x =</span>
          <div class="seg-sm" role="group" aria-label="Número de ventanillas para la sustitución">
            ${options.map((c) => `<button type="button" data-x="${c}" aria-pressed="${c === x}" ${c === opt.x ? 'title="Óptimo"' : ''}>${c}${c === opt.x ? '*' : ''}</button>`).join('')}
          </div>
        </div>`,
    })}

    <ol class="panel px-4 sm:px-6 py-2" data-steps>
      <li class="hidden md:grid grid-cols-[2.5rem_1fr_1fr] gap-6 py-3 text-xs text-slate-500 border-b border-line">
        <span></span><span>Fórmula general</span><span data-subst-label></span>
      </li>
    </ol>

    <div class="panel overflow-hidden fx-model" data-model>
      <div class="px-4 sm:px-6 pt-5 pb-3">
        <h3 class="text-sm font-medium">Modelo de programación entera</h3>
        <p class="mt-1 text-sm text-slate-500">Solo usa las variables <span class="text-ink">x</span> (ventanillas, entero) e <span class="text-ink">y</span> (costo, USD/h). Se arma restricción por restricción:</p>
      </div>
      <dl class="divide-y divide-line border-t border-line">
        ${modelRows
          .map(
            ([label, src, hint], i) => `
          <div class="fx-model-row grid grid-cols-1 md:grid-cols-[7rem_1fr] gap-x-6 gap-y-1 px-4 sm:px-6 py-3 ${label === 'Solución' ? 'bg-accent-soft/60' : ''}" style="--d:${i * 160}ms">
            <dt class="text-xs font-medium uppercase tracking-wider ${label === 'Solución' ? 'text-accent' : 'text-slate-500'} md:pt-3">${label}</dt>
            <dd class="min-w-0">
              <div class="math">${tex(src)}</div>
              <p class="text-xs text-slate-500">${hint}</p>
            </dd>
          </div>`,
          )
          .join('')}
      </dl>
    </div>`;

  const list = el.querySelector('[data-steps]');
  const substLabel = el.querySelector('[data-subst-label]');

  // Filas de pasos (la fórmula general es fija; la sustitución depende de x)
  const initial = buildSteps(P, opt, x);
  list.insertAdjacentHTML(
    'beforeend',
    initial
      .map(
        (s, i) => `
      <li class="fx-step grid grid-cols-[2.5rem_1fr] md:grid-cols-[2.5rem_1fr_1fr] gap-x-6 gap-y-3 py-5">
        <div class="relative flex justify-center">
          <span class="fx-dot">${String(i + 1).padStart(2, '0')}</span>
          ${i < initial.length - 1 ? '<span class="fx-line" aria-hidden="true"></span>' : ''}
        </div>
        <div class="min-w-0">
          <h3 class="text-sm font-medium">${s.title}</h3>
          <div class="math mt-2">${tex(s.formula)}</div>
        </div>
        <div class="min-w-0 col-start-2 md:col-start-3 md:pt-7 fx-value" data-value></div>
      </li>`,
      )
      .join(''),
  );
  const rows = [...list.querySelectorAll('.fx-step')];

  const fillValues = (flash) => {
    const steps = buildSteps(P, opt, x);
    substLabel.textContent = `Sustitución para x = ${x}${x === opt.x ? ' (óptimo)' : ''}`;
    rows.forEach((row, i) => {
      const box = row.querySelector('[data-value]');
      box.innerHTML = `
        <div class="math rounded-lg bg-slate-50 border border-line px-4 py-1">${tex(steps[i].value)}</div>
        <p class="fx-note mt-2 text-sm text-slate-500">${steps[i].note}</p>`;
      if (flash && row.hasAttribute('data-revealed')) {
        box.classList.remove('fx-flash');
        void box.offsetWidth; // reinicia la animación
        box.classList.add('fx-flash');
      }
    });
  };
  fillValues(false);

  el.querySelectorAll('[data-x]').forEach((btn) =>
    btn.addEventListener('click', () => {
      x = Number(btn.dataset.x);
      el.querySelectorAll('[data-x]').forEach((o) => o.setAttribute('aria-pressed', String(o === btn)));
      fillValues(true);
    }),
  );

  // Revelado progresivo al entrar en pantalla
  const targets = [...rows, el.querySelector('[data-model]')];
  if (reduceMotion || !('IntersectionObserver' in window)) {
    targets.forEach((t) => t.setAttribute('data-revealed', ''));
    return;
  }
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.setAttribute('data-revealed', '');
        io.unobserve(e.target);
      }),
    { threshold: 0.35, rootMargin: '0px 0px -10% 0px' },
  );
  targets.forEach((t) => io.observe(t));
  onAbort(lifecycle(el), () => io.disconnect());
}
