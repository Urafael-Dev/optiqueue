import { mmc, optimize } from '../lib/queue.js';
import { escapeHtml, num, pct, seconds, usd } from '../lib/format.js';
import { provide, use } from '../lib/bridge.js';
import { refreshIcons } from '../ui.js';

/**
 * Comparador de escenarios: el asistente (o el usuario) agrega variantes del problema
 * y se comparan lado a lado contra el enunciado. Se guarda en el navegador.
 */
const KEY = 'optiqueue.comparador';
const MAX_ROWS = 12;
const WIDE = { xMin: 1, xMax: 80 };

const load = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.slice(0, MAX_ROWS) : [];
  } catch {
    return [];
  }
};
const save = (rows) => localStorage.setItem(KEY, JSON.stringify(rows));

/** Resuelve un escenario: óptimo (o el número fijo de ventanillas pedido) y sus métricas. */
export function solveScenario(P0, s) {
  const params = { ...P0, lambda: s.lambda ?? P0.lambda, mu: s.mu ?? P0.mu, cs: s.cs ?? P0.cs, cw: s.cw ?? P0.cw, wqMaxH: s.wqMin != null ? s.wqMin / 60 : P0.wqMaxH };
  if (Number.isInteger(s.x)) return { params, fixed: true, m: mmc(s.x, params) };
  const o = optimize({ ...params, ...WIDE });
  return { params, fixed: false, m: o.status === 'Optimal' ? o.best : null };
}

export function renderComparator(el, P0) {
  let rows = load();
  let flash = null; // id de la fila recién agregada, para resaltarla

  el.innerHTML = `
    <div class="sec-head">
      <div>
        <span class="sec-num cmp-num"><i data-lucide="git-compare"></i></span>
        <h2 id="h-comparador" class="sec-title">Comparador de escenarios</h2>
        <p class="sec-desc">Variantes del caso lado a lado frente al escenario base. Pídele al asistente cosas como «compara λ = 200, 220 y 240» o «agrega un escenario con μ = 14».</p>
      </div>
      <button type="button" class="chip-btn" data-cmp-clear hidden>Vaciar</button>
    </div>
    <div class="panel overflow-hidden" data-cmp-body></div>`;

  const body = el.querySelector('[data-cmp-body]');
  const clearBtn = el.querySelector('[data-cmp-clear]');

  const cell = (v) => `<td>${v}</td>`;
  const draw = () => {
    clearBtn.hidden = !rows.length;
    const all = [{ id: 'base', nombre: 'Escenario base', base: true }, ...rows].map((r) => ({ ...r, sol: solveScenario(P0, r) }));
    const feasible = all.filter((r) => r.sol.m?.stable);
    const cheapest = feasible.length ? feasible.reduce((a, b) => (b.sol.m.totalCost < a.sol.m.totalCost ? b : a)).id : null;
    const changed = (r, k, v, fmt) => (r.base || r[k] == null ? `<span class="text-slate-500">${fmt(v)}</span>` : `<strong class="text-ink">${fmt(v)}</strong>`);

    body.innerHTML = `
      <div class="overflow-x-auto">
        <table class="table cmp-table w-full text-sm">
          <thead><tr>
            <th scope="col" class="!text-left">Escenario</th><th scope="col">λ</th><th scope="col">μ</th><th scope="col">C<sub>s</sub></th><th scope="col">C<sub>w</sub></th><th scope="col">W<sub>q</sub> máx</th>
            <th scope="col">Ventanillas</th><th scope="col">ρ</th><th scope="col">W<sub>q</sub></th><th scope="col">Costo total</th><th scope="col"><span class="sr-only">Acciones</span></th>
          </tr></thead>
          <tbody>
            ${all
              .map((r) => {
                const { params: p, m, fixed } = r.sol;
                const ok = m?.stable;
                return `<tr class="${r.id === flash ? 'cmp-flash' : ''} ${r.base ? 'cmp-base' : ''}" data-id="${r.id}">
                  <th scope="row" class="!text-left font-medium text-ink">${escapeHtml(r.nombre)}${r.id === cheapest ? ' <span class="cmp-best">más barato</span>' : ''}</th>
                  ${cell(changed(r, 'lambda', p.lambda, (v) => num(v, 0)))}${cell(changed(r, 'mu', p.mu, (v) => num(v, 1)))}
                  ${cell(changed(r, 'cs', p.cs, (v) => usd(v, 0)))}${cell(changed(r, 'cw', p.cw, (v) => usd(v, 0)))}${cell(changed(r, 'wqMin', p.wqMaxH * 60, (v) => `${num(v, 1)} min`))}
                  ${cell(m ? `<strong class="text-ink">${m.c}</strong>${fixed ? ' <span class="text-xs text-slate-400">fijo</span>' : ''}` : '<span class="text-bad">sin solución</span>')}
                  ${cell(m ? pct(m.rho) : '—')}
                  ${cell(ok ? `<span class="${m.meetsSla ? '' : 'text-bad'}">${seconds(m.Wq, 1)}</span>` : '<span class="text-bad">∞</span>')}
                  ${cell(ok ? `<strong class="text-ink">${usd(m.totalCost)}</strong>` : '<span class="text-bad">∞</span>')}
                  <td class="whitespace-nowrap">
                    ${r.base ? '' : `<button type="button" class="cmp-act" data-cmp-apply title="Recalcular toda la app con este escenario" aria-label="Aplicar ${escapeHtml(r.nombre)} a la app"><i data-lucide="play"></i></button>
                    <button type="button" class="cmp-act" data-cmp-remove title="Quitar" aria-label="Quitar ${escapeHtml(r.nombre)}"><i data-lucide="x"></i></button>`}
                  </td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>
      ${rows.length ? '' : '<p class="px-5 sm:px-6 py-4 text-sm text-slate-500 border-t border-line">Todavía no hay escenarios para comparar. Abre el <strong class="text-ink">Asistente IA</strong> y pídele que agregue algunos.</p>'}`;
    refreshIcons();
    flash = null;
  };

  body.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const row = rows.find((r) => r.id === tr.dataset.id);
    if (!row) return;
    if (e.target.closest('[data-cmp-remove]')) {
      rows = rows.filter((r) => r !== row);
      save(rows);
      draw();
    } else if (e.target.closest('[data-cmp-apply]')) {
      use('app')?.apply({ lambda: row.lambda, mu: row.mu, cs: row.cs, cw: row.cw, wqMin: row.wqMin }, row.nombre);
    }
  });
  clearBtn.addEventListener('click', () => {
    rows = [];
    save(rows);
    draw();
  });

  provide('comparador', {
    add(s) {
      const nombre = String(s.nombre || `Escenario ${rows.length + 1}`).slice(0, 60);
      const row = { id: `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, nombre, lambda: s.lambda, mu: s.mu, cs: s.cs, cw: s.cw, wqMin: s.wqMin, x: s.x };
      // mismo nombre: se reemplaza en lugar de duplicar
      rows = rows.filter((r) => r.nombre.toLowerCase() !== nombre.toLowerCase());
      rows.push(row);
      if (rows.length > MAX_ROWS) rows.shift();
      save(rows);
      flash = row.id;
      draw();
      return { row, sol: solveScenario(P0, row) };
    },
    remove(nombre) {
      const before = rows.length;
      rows = nombre ? rows.filter((r) => r.nombre.toLowerCase() !== String(nombre).toLowerCase()) : [];
      save(rows);
      draw();
      return before - rows.length;
    },
    list: () => rows.map((r) => ({ ...r, sol: solveScenario(P0, r) })),
  });

  draw();
}
