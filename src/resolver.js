import './styles.css';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { FIELD_INFO, MODELS, MULTI_SERVER } from './lib/models.js';
import { UNITS, hashToSpec, runSpec, specToHash, summarize } from './lib/solverSpec.js';
import { escapeHtml } from './lib/format.js';
import { provide, use } from './lib/bridge.js';
import { refreshIcons, setupTheme } from './ui.js';
import { assistantAvailable, renderAssistant } from './sections/assistant.js';

/**
 * Página «Resolvedor de colas»: resuelve cualquier ejercicio de los modelos clásicos
 * con desarrollo paso a paso. El asistente puede leer un enunciado y cargarlo aquí.
 */

const $ = (s, root = document) => root.querySelector(s);
const f = (v, d = 3) => (Number.isFinite(v) ? v.toLocaleString('es', { maximumFractionDigits: d }) : '∞');
const pctf = (v, d = 1) => (Number.isFinite(v) ? `${(v * 100).toLocaleString('es', { maximumFractionDigits: d })} %` : '—');
const money = (v) => (Number.isFinite(v) ? `$${v.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '∞');
const tex = (s) => katex.renderToString(s, { displayMode: true, throwOnError: false, strict: 'ignore', output: 'html' });
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const DEFAULTS = { lambda: 20, mu: 24, c: 2, K: 5, N: 10, sigma: 0.02, k: 2 };

// Ejercicios clásicos listos para cargar
const EXAMPLES = [
  { titulo: 'Cajero de banco', texto: 'Llegan 20 clientes por hora a un cajero que atiende a cada uno en 2,5 minutos en promedio.', spec: { modelo: 'mm1', unidad: 'hora', lambda: 20, mu: 24 } },
  { titulo: 'Peaje con 3 casetas', texto: 'Llegan 240 autos por hora; cada caseta atiende 100 autos por hora.', spec: { modelo: 'mmc', unidad: 'hora', lambda: 240, mu: 100, c: 3 } },
  { titulo: 'Peluquería con 4 sillas', texto: 'Un peluquero atiende 6 clientes por hora; llegan 5 por hora y solo hay 4 sillas de espera.', spec: { modelo: 'mm1k', unidad: 'hora', lambda: 5, mu: 6, K: 5 } },
  { titulo: 'Central telefónica (Erlang B)', texto: 'Llegan 30 llamadas por hora de 6 minutos promedio a 4 líneas; si todas están ocupadas, la llamada se pierde.', spec: { modelo: 'mmck', unidad: 'hora', lambda: 30, mu: 10, c: 4, K: 4 } },
  { titulo: 'Taller con 10 máquinas', texto: 'Cada máquina falla cada 8 h y la reparación toma 2 h. Un mecánico cuesta $20/h y una máquina parada $60/h. ¿Cuántos mecánicos conviene?', spec: { modelo: 'mmcn', unidad: 'hora', lambda: 0.125, mu: 0.5, c: 2, N: 10, cs: 20, cw: 60, base: 'L', optimizar: true, cMin: 1, cMax: 6 } },
  { titulo: 'Lavado automático', texto: 'Llegan 8 autos por hora a un lavado que tarda exactamente 6 minutos por auto.', spec: { modelo: 'md1', unidad: 'hora', lambda: 8, mu: 10 } },
  { titulo: 'Trámite en 3 etapas', texto: 'Llegan 4 personas por hora; el trámite tiene 3 etapas y en total se atienden 5 por hora.', spec: { modelo: 'mek1', unidad: 'hora', lambda: 4, mu: 5, k: 3 } },
  { titulo: 'Control migratorio (caso)', texto: 'Migración: λ = 180 pas/h, μ = 15 por ventanilla, Cs = $50/h, Cw = $40/h y espera máxima de 6 min.', spec: { modelo: 'mmc', unidad: 'hora', lambda: 180, mu: 15, c: 15, cs: 50, cw: 40, optimizar: true, cMin: 12, cMax: 20, maxWq: 0.1 } },
];

let spec = hashToSpec(location.hash) ?? { ...EXAMPLES[1].spec };
const modes = { lambda: 'tasa', mu: 'tasa' }; // cómo escribe el usuario λ y μ: tasa o tiempo promedio
let lastRun = null;

const root = $('#resolver');

// ---------- Estructura ----------
root.innerHTML = `
  <section class="rv-head">
    <div class="min-w-0">
      <p class="rv-overline">OptiQueue · Módulo de análisis</p>
      <h1 class="rv-title">Resolvedor de modelos de colas</h1>
      <p class="rv-lead">Calcula las medidas de desempeño de los modelos clásicos de líneas de espera con el desarrollo completo de cada fórmula, la distribución del número de clientes, los costos del sistema y el número de servidores de menor costo.</p>
    </div>
    <dl class="rv-facts">
      <div><dt>Modelos</dt><dd>${Object.keys(MODELS).length}</dd></div>
      <div><dt>Desarrollo</dt><dd>Paso a paso</dd></div>
      <div><dt>Costos</dt><dd>Óptimo de c</dd></div>
    </dl>
  </section>

  <section class="rv-ai-wrap" id="asistente" aria-label="Resolver un enunciado con IA" data-ai-mount></section>

  <div class="rv-grid">
    <div class="space-y-5 min-w-0">
      <section class="rv-card" aria-labelledby="rv-step1">
        <div class="rv-card-head"><span class="rv-step">1</span><h2 id="rv-step1" class="rv-h2">Elige el modelo</h2>
          <label class="ml-auto flex items-center gap-2 text-xs text-slate-500">Ejemplos
            <select class="field !w-auto !py-1 text-xs" data-examples><option value="">Cargar un ejemplo…</option>${EXAMPLES.map((e, i) => `<option value="${i}">${escapeHtml(e.titulo)} (${MODELS[e.spec.modelo].kendall})</option>`).join('')}</select>
          </label>
        </div>
        <div class="rv-models" role="radiogroup" aria-label="Modelo de colas" data-models>
          ${Object.entries(MODELS)
            .map(
              ([key, m], i) => `<button type="button" role="radio" class="rv-model" data-model="${key}" style="--i:${i}">
                <span class="rv-model-ico"><i data-lucide="${m.icon}"></i></span>
                <span class="rv-model-k">${m.kendall}</span>
                <span class="rv-model-n">${m.name}</span>
              </button>`,
            )
            .join('')}
        </div>
        <p class="rv-model-desc" data-model-desc></p>
      </section>

      <section class="rv-card" aria-labelledby="rv-step2">
        <div class="rv-card-head"><span class="rv-step">2</span><h2 id="rv-step2" class="rv-h2">Datos del problema</h2>
          <label class="ml-auto flex items-center gap-2 text-xs text-slate-500">Unidad de tiempo
            <select class="field !w-auto !py-1 text-xs" data-unit>${Object.entries(UNITS).map(([k, u]) => `<option value="${k}">${u.label}</option>`).join('')}</select>
          </label>
        </div>
        <div class="rv-fields" data-fields></div>
        <details class="rv-costs" data-costs>
          <summary><i data-lucide="wallet"></i>Costos y número óptimo de servidores <span class="text-slate-400 font-normal">(opcional)</span><i data-lucide="chevron-down" class="rv-chev"></i></summary>
          <div class="rv-costs-body" data-costs-body></div>
        </details>
      </section>
    </div>

    <section class="rv-results" aria-labelledby="rv-step3">
      <div class="rv-card-head"><span class="rv-step">3</span><h2 id="rv-step3" class="rv-h2">Resultados</h2>
        <div class="ml-auto flex gap-1.5">
          <button type="button" class="chip-btn inline-flex items-center gap-1" data-copy><i data-lucide="copy" class="w-3 h-3"></i>Copiar</button>
          <button type="button" class="chip-btn inline-flex items-center gap-1" data-explain><i data-lucide="message-square-text" class="w-3 h-3"></i>Explicar con IA</button>
        </div>
      </div>
      <div data-results aria-live="polite"></div>
    </section>
  </div>`;

// ---------- Formulario ----------
const fieldsEl = $('[data-fields]');
const costsBody = $('[data-costs-body]');
const unit = () => UNITS[spec.unidad] ?? UNITS.hora;

function fieldHtml(key) {
  const info = FIELD_INFO[key];
  const u = unit();
  const v = spec[key];
  if (key === 'lambda' || key === 'mu') {
    const asTime = modes[key] === 'tiempo';
    const shown = asTime ? 1 / v : v;
    const timeLabel = key === 'lambda' ? `${u.plural} entre llegadas` : `${u.plural} por servicio`;
    return `<div class="rv-field">
      <label for="f-${key}"><span class="rv-sym">${info.sym}</span>${key === 'lambda' ? (spec.modelo === 'mmcn' ? 'Tasa de llegadas por cliente' : 'Llegadas') : 'Servicio por servidor'}</label>
      <div class="rv-input-group">
        <input id="f-${key}" type="number" min="0" step="any" class="field" data-field="${key}" value="${Number.isFinite(shown) ? +shown.toPrecision(8) : ''}" />
        <select class="field rv-mode" data-mode="${key}" aria-label="Cómo se expresa ${info.sym}">
          <option value="tasa" ${asTime ? '' : 'selected'}>por ${u.label}</option>
          <option value="tiempo" ${asTime ? 'selected' : ''}>${timeLabel}</option>
        </select>
      </div>
    </div>`;
  }
  const hint = { sigma: `en ${u.plural}`, K: 'máx. en el sistema (incluye a los atendidos)', N: 'clientes potenciales', c: 'en paralelo', k: 'fases' }[key] ?? '';
  return `<div class="rv-field">
    <label for="f-${key}"><span class="rv-sym">${info.sym}</span>${info.label}</label>
    <input id="f-${key}" type="number" min="${key === 'sigma' ? 0 : 1}" step="${info.int ? 1 : 'any'}" class="field" data-field="${key}" value="${spec[key] ?? ''}" />
    <span class="rv-hint">${hint}</span>
  </div>`;
}

function buildForm() {
  const m = MODELS[spec.modelo];
  for (const k of m.fields) if (!Number.isFinite(spec[k])) spec[k] = DEFAULTS[k];
  if (spec.modelo === 'mmck' && spec.K < spec.c) spec.K = spec.c;
  document.querySelectorAll('[data-model]').forEach((b) => {
    const on = b.dataset.model === spec.modelo;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  $('[data-model-desc]').innerHTML = `<strong>${m.kendall}</strong> · ${m.desc}`;
  $('[data-unit]').value = spec.unidad ?? 'hora';
  fieldsEl.innerHTML = m.fields.map(fieldHtml).join('');
  const multi = MULTI_SERVER.has(spec.modelo);
  const u = unit();
  costsBody.innerHTML = `
    <div class="rv-fields">
      <div class="rv-field"><label for="f-cs"><span class="rv-sym">C<sub>s</sub></span>Costo por servidor</label><input id="f-cs" type="number" min="0" step="any" class="field" data-field="cs" value="${spec.cs ?? ''}" placeholder="0" /><span class="rv-hint">$ por ${u.label}</span></div>
      <div class="rv-field"><label for="f-cw"><span class="rv-sym">C<sub>w</sub></span>Costo por cliente</label><input id="f-cw" type="number" min="0" step="any" class="field" data-field="cw" value="${spec.cw ?? ''}" placeholder="0" /><span class="rv-hint">$ por ${u.label} y cliente</span></div>
      <div class="rv-field"><label for="f-base">Se cobra por cada cliente</label><select id="f-base" class="field" data-base><option value="Lq" ${spec.base !== 'L' ? 'selected' : ''}>en cola (L<sub>q</sub>)</option><option value="L" ${spec.base === 'L' ? 'selected' : ''}>en el sistema (L)</option></select><span class="rv-hint">${spec.base === 'L' ? 'p. ej. máquina parada' : 'costo de esperar'}</span></div>
      ${['mm1k', 'mmck'].includes(spec.modelo) ? `<div class="rv-field"><label for="f-cr"><span class="rv-sym">C<sub>r</sub></span>Costo por cliente perdido</label><input id="f-cr" type="number" min="0" step="any" class="field" data-field="cr" value="${spec.cr ?? ''}" placeholder="0" /><span class="rv-hint">$ por cliente rechazado</span></div>` : ''}
    </div>
    ${
      multi
        ? `<label class="rv-switch"><input type="checkbox" data-opt ${spec.optimizar ? 'checked' : ''} /><span class="rv-switch-ui" aria-hidden="true"></span>Buscar el número de servidores de menor costo</label>
      <div class="rv-fields mt-3 ${spec.optimizar ? '' : 'hidden'}" data-opt-body>
        <div class="rv-field"><label for="f-cMin">Desde c =</label><input id="f-cMin" type="number" min="1" step="1" class="field" data-field="cMin" value="${spec.cMin ?? ''}" placeholder="auto" /></div>
        <div class="rv-field"><label for="f-cMax">Hasta c =</label><input id="f-cMax" type="number" min="1" step="1" class="field" data-field="cMax" value="${spec.cMax ?? ''}" placeholder="auto" /></div>
        <div class="rv-field"><label for="f-maxWq">W<sub>q</sub> máxima</label><input id="f-maxWq" type="number" min="0" step="any" class="field" data-field="maxWq" value="${spec.maxWq ?? ''}" placeholder="sin límite" /><span class="rv-hint">en ${u.plural}</span></div>
        ${spec.modelo === 'mmck' ? `<div class="rv-field"><label for="f-maxBlock">Bloqueo máximo</label><input id="f-maxBlock" type="number" min="0" max="1" step="any" class="field" data-field="maxBlock" value="${spec.maxBlock ?? ''}" placeholder="sin límite" /><span class="rv-hint">probabilidad (0 a 1)</span></div>` : ''}
      </div>`
        : '<p class="text-xs text-slate-500 mt-2">La búsqueda del número óptimo de servidores está disponible en M/M/c, M/M/c/K y población finita.</p>'
    }`;
  if ((spec.cs ?? 0) > 0 || (spec.cw ?? 0) > 0 || spec.optimizar) $('[data-costs]').open = true;
  refreshIcons();
}

// ---------- Resultados ----------
const resultsEl = $('[data-results]');

function timeText(v) {
  const u = unit();
  if (!Number.isFinite(v)) return '∞';
  const mins = v * u.toMin;
  const extra = u.toMin === 1 ? (mins < 1 ? ` · ${f(mins * 60, 1)} s` : '') : mins < 1 ? ` · ${f(mins * 60, 1)} s` : mins < 600 ? ` · ${f(mins, 2)} min` : '';
  return `${f(v, 4)} ${u.short}${extra}`;
}

function interpretation(res, run) {
  const m = res.metrics;
  const parts = [];
  parts.push(`En promedio hay <strong>${f(m.L, 2)}</strong> clientes en el sistema y <strong>${f(m.Lq, 2)}</strong> esperando en la cola.`);
  parts.push(`Cada cliente pasa <strong>${timeText(m.W)}</strong> en total, de los cuales <strong>${timeText(m.Wq)}</strong> en la fila.`);
  if (m.utilization != null) parts.push(`Los servidores están ocupados el <strong>${pctf(m.utilization)}</strong> del tiempo.`);
  if (m.Pw != null && res.model !== 'mmck') parts.push(`La probabilidad de que un cliente tenga que esperar es <strong>${pctf(m.Pw)}</strong>.`);
  if (m.Pblock != null) parts.push(`El <strong>${pctf(m.Pblock, 2)}</strong> de los clientes encuentra el sistema lleno y se pierde (${f(m.lost, 3)} por ${unit().label}).`);
  if (m.operating != null) parts.push(`En promedio funcionan <strong>${f(m.operating, 2)}</strong> de ${res.params.N} clientes (máquinas).`);
  if (run.cost) parts.push(`Costo total: <strong>${money(run.cost.total)}</strong> por ${unit().label}.`);
  return parts.join(' ');
}

function pnChart(pn) {
  const n = Math.min(pn.length, 41);
  const vals = pn.slice(0, n);
  const max = Math.max(...vals, 1e-9);
  const W = 640;
  const H = 210;
  const L = 34;
  const B = 26;
  const bw = (W - L - 8) / n;
  let acc = 0;
  const cum = vals.map((v) => (acc += v));
  const y = (v) => H - B - (v / max) * (H - B - 14);
  const yc = (v) => H - B - v * (H - B - 14);
  return `<svg viewBox="0 0 ${W} ${H}" class="rv-pn" role="img" aria-label="Distribución de probabilidad del número de clientes">
    ${[0, 0.5, 1].map((t) => `<line x1="${L}" x2="${W - 4}" y1="${y(max * t)}" y2="${y(max * t)}" class="rv-grid-line"/><text x="${L - 6}" y="${y(max * t) + 4}" text-anchor="end" class="rv-axis">${f(max * t, 2)}</text>`).join('')}
    ${vals
      .map(
        (v, i) => `<g class="rv-bar-g" style="--d:${i * 18}ms"><rect x="${L + i * bw + bw * 0.15}" y="${y(v)}" width="${bw * 0.7}" height="${Math.max(0, H - B - y(v))}" rx="${Math.min(4, bw * 0.2)}" class="rv-bar"><title>P(${i}) = ${f(v, 5)} · acumulada ${f(cum[i], 4)}</title></rect>
        ${n <= 21 || i % 5 === 0 ? `<text x="${L + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle" class="rv-axis">${i}</text>` : ''}</g>`,
      )
      .join('')}
    <polyline points="${cum.map((c, i) => `${L + i * bw + bw / 2},${yc(c)}`).join(' ')}" class="rv-cum"/>
  </svg>`;
}

function optTable(run) {
  const o = run.optimization;
  const u = unit();
  const ok = o.rows.filter((r) => r.ok);
  if (!ok.length) return '<p class="text-sm text-bad">Ningún valor de c del rango da un sistema estable.</p>';
  const maxCost = Math.max(...ok.map((r) => r.cost.total));
  const hasBlock = ok.some((r) => r.metrics.Pblock != null);
  return `
    ${o.best ? `<p class="rv-best"><i data-lucide="circle-check"></i>Conviene <strong>c = ${o.best.c}</strong> servidores: costo total de <strong>${money(o.best.cost.total)}</strong> por ${u.label}.${o.best.c !== spec.c ? ` <button type="button" class="link" data-use-c="${o.best.c}">Usar c = ${o.best.c}</button>` : ''}</p>` : '<p class="text-sm text-bad">Ningún número de servidores del rango cumple las restricciones.</p>'}
    <div class="rv-cost-bars">${ok
      .map((r) => `<div class="rv-cost-bar ${o.best?.c === r.c ? 'is-best' : ''} ${r.feasible ? '' : 'is-off'}" title="c = ${r.c}: ${money(r.cost.total)}"><span style="height:${Math.max(4, (r.cost.total / maxCost) * 100)}%"></span><em>${r.c}</em></div>`)
      .join('')}</div>
    <div class="overflow-x-auto"><table class="table w-full text-sm rv-table">
      <thead><tr><th scope="col">c</th><th scope="col">Utilización</th><th scope="col">L<sub>q</sub></th><th scope="col">W<sub>q</sub></th>${hasBlock ? '<th scope="col">Bloqueo</th>' : ''}<th scope="col">Servicio</th><th scope="col">Espera</th><th scope="col">Total</th></tr></thead>
      <tbody>${o.rows
        .map((r) =>
          r.ok
            ? `<tr class="${o.best?.c === r.c ? 'rv-row-best' : ''} ${r.feasible ? '' : 'text-slate-400'}"><td class="font-medium">${r.c}${r.feasible ? '' : ' ✕'}</td><td>${pctf(r.metrics.utilization)}</td><td>${f(r.metrics.Lq, 3)}</td><td>${timeText(r.metrics.Wq)}</td>${hasBlock ? `<td>${pctf(r.metrics.Pblock ?? 0, 2)}</td>` : ''}<td>${money(r.cost.service)}</td><td>${money(r.cost.waiting + r.cost.lost)}</td><td class="font-semibold">${money(r.cost.total)}</td></tr>`
            : `<tr class="text-slate-400"><td>${r.c}</td><td colspan="${hasBlock ? 7 : 6}">inestable</td></tr>`,
        )
        .join('')}</tbody>
    </table></div>
    ${spec.maxWq != null || spec.maxBlock != null ? '<p class="text-xs text-slate-500 mt-2">✕ = no cumple las restricciones indicadas.</p>' : ''}`;
}

function countUp(el, to, fmt) {
  const from = Number(el.dataset.v ?? 0);
  el.dataset.v = String(to);
  if (reduced() || !Number.isFinite(to) || !Number.isFinite(from)) {
    el.textContent = fmt(to);
    return;
  }
  const t0 = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / 650);
    const e = 1 - (1 - k) ** 3;
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function render() {
  lastRun = runSpec(spec);
  const { res } = lastRun;
  history.replaceState(null, '', specToHash(spec));
  if (!res.ok) {
    resultsEl.innerHTML = `<div class="rv-error"><i data-lucide="triangle-alert"></i><div><p class="font-semibold">No se puede resolver con estos datos</p><p class="text-sm mt-1">${escapeHtml(res.error)}</p>${
      res.rho != null && spec.modelo === 'mmc' ? `<button type="button" class="link mt-2" data-use-c="${Math.floor(spec.lambda / spec.mu) + 1}">Probar con c = ${Math.floor(spec.lambda / spec.mu) + 1} servidores</button>` : ''
    }</div></div>`;
    refreshIcons();
    return;
  }
  const m = res.metrics;
  const chips = [
    m.rho != null && ['ρ', f(m.rho, 4)],
    m.utilization != null && m.utilization !== m.rho && ['Utilización', pctf(m.utilization)],
    ['P₀', f(m.P0, 5)],
    m.Pw != null && ['P(esperar)', pctf(m.Pw, 2)],
    m.Pblock != null && ['P(bloqueo)', pctf(m.Pblock, 2)],
    m.lambdaEff != null && m.lambdaEff !== spec.lambda && ['λ efectiva', `${f(m.lambdaEff, 4)} /${unit().short}`],
    m.operating != null && ['Funcionando', f(m.operating, 3)],
    m.idle != null && ['Servidores ociosos', f(m.idle, 3)],
  ].filter(Boolean);

  const prevKey = resultsEl.dataset.key;
  const key = `${spec.modelo}`;
  resultsEl.dataset.key = key;
  const fresh = prevKey !== key;

  resultsEl.innerHTML = `
    <div class="rv-res-head">
      <span class="rv-kendall">${res.kendall}</span>
      <span class="rv-ok"><i data-lucide="circle-check"></i>${spec.titulo ? escapeHtml(spec.titulo) : 'Resuelto'}</span>
    </div>
    <div class="rv-kpis">
      ${[
        ['L', 'Clientes en el sistema', m.L, (v) => f(v, 4)],
        ['Lq', 'Clientes en cola', m.Lq, (v) => f(v, 4)],
        ['W', 'Tiempo en el sistema', m.W, timeText],
        ['Wq', 'Tiempo en cola', m.Wq, timeText],
      ]
        .map(([k, label], i) => `<div class="rv-kpi" style="--i:${i}"><span class="rv-kpi-sym">${k.replace('q', '<sub>q</sub>')}</span><span class="rv-kpi-label">${label}</span><span class="rv-kpi-val" data-kpi="${k}">${f(0)}</span></div>`)
        .join('')}
    </div>
    <div class="rv-chips">${chips.map(([k, v], i) => `<span class="rv-chip" style="--i:${i}"><em>${k}</em>${v}</span>`).join('')}</div>
    <p class="rv-interp">${interpretation(res, lastRun)}</p>

    <details class="rv-block" open>
      <summary><i data-lucide="sigma"></i>Desarrollo paso a paso<i data-lucide="chevron-down" class="rv-chev"></i></summary>
      <ol class="rv-steps">${res.steps.map((s, i) => `<li style="--i:${i}"><p class="rv-step-title">${s.title}</p><div class="rv-tex">${tex(s.tex)}</div>${s.note ? `<p class="rv-step-note">${s.note}</p>` : ''}</li>`).join('')}</ol>
    </details>

    ${
      res.pn?.length
        ? `<details class="rv-block" open>
      <summary><i data-lucide="chart-column"></i>Distribución del número de clientes P<sub>n</sub><i data-lucide="chevron-down" class="rv-chev"></i></summary>
      ${pnChart(res.pn)}
      <p class="text-xs text-slate-500 -mt-1 mb-3"><span class="rv-legend-bar"></span>P<sub>n</sub> · <span class="rv-legend-line"></span>probabilidad acumulada. Pasa el cursor sobre las barras para ver los valores.</p>
      <div class="rv-calc">
        <label>Probabilidad con <input type="number" min="0" step="1" value="${Math.max(0, Math.round(m.L))}" class="field !w-20 !py-1" data-k /> clientes</label>
        <span data-k-out></span>
      </div>
      ${
        res.waitTail
          ? `<div class="rv-calc"><label>Probabilidad de esperar más de <input type="number" min="0" step="any" value="${+(m.Wq * 2 || 0.1).toPrecision(2)}" class="field !w-24 !py-1" data-t /> ${unit().plural}</label><span data-t-out></span></div>`
          : ''
      }
    </details>`
        : ''
    }

    ${lastRun.optimization ? `<details class="rv-block" open><summary><i data-lucide="users"></i>Número óptimo de servidores<i data-lucide="chevron-down" class="rv-chev"></i></summary>${optTable(lastRun)}</details>` : ''}
    ${lastRun.cost && !lastRun.optimization ? `<div class="rv-costline"><span>Servicio <strong>${money(lastRun.cost.service)}</strong></span><span>Espera <strong>${money(lastRun.cost.waiting)}</strong></span>${lastRun.cost.lost ? `<span>Rechazos <strong>${money(lastRun.cost.lost)}</strong></span>` : ''}<span class="rv-costline-total">Total <strong>${money(lastRun.cost.total)}</strong> /${unit().short}</span></div>` : ''}`;

  resultsEl.classList.toggle('is-fresh', fresh);
  const fmts = { L: (v) => f(v, 4), Lq: (v) => f(v, 4), W: timeText, Wq: timeText };
  resultsEl.querySelectorAll('[data-kpi]').forEach((el) => {
    const k = el.dataset.kpi;
    el.dataset.v = String(resultsEl.dataset[`prev${k}`] ?? 0);
    countUp(el, m[k], fmts[k]);
    resultsEl.dataset[`prev${k}`] = String(m[k]);
  });
  updateCalcs();
  refreshIcons();
}

function updateCalcs() {
  const res = lastRun?.res;
  if (!res?.ok) return;
  const kIn = $('[data-k]', resultsEl);
  if (kIn && res.pn) {
    const k = Math.max(0, Math.floor(Number(kIn.value) || 0));
    const pk = res.pn[k] ?? 0;
    const cum = res.pn.slice(0, k + 1).reduce((a, b) => a + b, 0);
    $('[data-k-out]', resultsEl).innerHTML = `P(n = ${k}) = <strong>${f(pk, 5)}</strong> · P(n ≤ ${k}) = <strong>${f(Math.min(1, cum), 5)}</strong> · P(n > ${k}) = <strong>${f(Math.max(0, 1 - cum), 5)}</strong>`;
  }
  const tIn = $('[data-t]', resultsEl);
  if (tIn && res.waitTail) {
    const t = Math.max(0, Number(tIn.value) || 0);
    const w = res.waitTail(t);
    $('[data-t-out]', resultsEl).innerHTML = `P(W<sub>q</sub> > ${f(t, 4)}) = <strong>${f(w.Wq, 5)}</strong>${w.W != null ? ` · P(W > ${f(t, 4)}) = <strong>${f(w.W, 5)}</strong>` : ''}`;
  }
}

// ---------- Eventos ----------
let timer = 0;
const schedule = () => {
  clearTimeout(timer);
  timer = setTimeout(render, 140);
};

$('[data-models]').addEventListener('click', (e) => {
  const b = e.target.closest('[data-model]');
  if (!b || b.dataset.model === spec.modelo) return;
  spec = { ...spec, modelo: b.dataset.model, titulo: undefined };
  buildForm();
  render();
});
$('[data-models]').addEventListener('keydown', (e) => {
  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
  e.preventDefault();
  const keys = Object.keys(MODELS);
  const i = keys.indexOf(spec.modelo) + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1);
  spec = { ...spec, modelo: keys[(i + keys.length) % keys.length], titulo: undefined };
  buildForm();
  render();
  $(`[data-model="${spec.modelo}"]`).focus();
});

const card = $('.rv-grid');
card.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.field) {
    const k = t.dataset.field;
    const raw = t.value === '' ? undefined : Number(t.value);
    spec[k] = (k === 'lambda' || k === 'mu') && modes[k] === 'tiempo' && raw ? 1 / raw : raw;
    spec.titulo = undefined;
    schedule();
  }
});
card.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.mode) {
    modes[t.dataset.mode] = t.value;
    buildForm();
  } else if (t.matches('[data-unit]')) {
    spec.unidad = t.value;
    buildForm();
    render();
  } else if (t.matches('[data-base]')) {
    spec.base = t.value;
    buildForm();
    render();
  } else if (t.matches('[data-opt]')) {
    spec.optimizar = t.checked;
    $('[data-opt-body]').classList.toggle('hidden', !t.checked);
    render();
  } else if (t.matches('[data-examples]') && t.value !== '') {
    const ex = EXAMPLES[Number(t.value)];
    spec = { ...ex.spec, titulo: ex.titulo };
    modes.lambda = modes.mu = 'tasa';
    buildForm();
    render();
    t.value = '';
    flashResults();
  }
});
resultsEl.addEventListener('input', (e) => e.target.matches('[data-k], [data-t]') && updateCalcs());
document.addEventListener('click', (e) => {
  const use = e.target.closest('[data-use-c]');
  if (use) {
    spec.c = Number(use.dataset.useC);
    if (spec.modelo === 'mmck' && spec.K < spec.c) spec.K = spec.c;
    buildForm();
    render();
  }
});

function flashResults() {
  const box = $('.rv-results');
  box.classList.remove('rv-flash');
  void box.offsetWidth;
  box.classList.add('rv-flash');
  if (matchMedia('(max-width: 1023px)').matches) box.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
}

// Copiar un resumen en texto
$('[data-copy]').addEventListener('click', async (e) => {
  const s = summarize(lastRun);
  const txt = s.ok
    ? [`${s.modelo} (unidad: ${s.unidad_de_tiempo})`, `Datos: ${Object.entries(s.datos).map(([k, v]) => `${k} = ${v}`).join(', ')}`, ...Object.entries(s.resultados).map(([k, v]) => `${k}: ${typeof v === 'object' ? `${Object.values(v)[0]} ${s.unidad_de_tiempo}` : v}`), s.costo ? `Costo total: ${s.costo.total}` : ''].filter(Boolean).join('\n')
    : s.error;
  try {
    await navigator.clipboard.writeText(txt);
    e.currentTarget.innerHTML = '<i data-lucide="check" class="w-3 h-3"></i>Copiado';
  } catch {
    e.currentTarget.textContent = 'No se pudo copiar';
  }
  refreshIcons();
  setTimeout(() => {
    $('[data-copy]').innerHTML = '<i data-lucide="copy" class="w-3 h-3"></i>Copiar';
    refreshIcons();
  }, 1800);
});

// Pedirle a la IA
const aiAsk = (q) => use('asistente')?.ask(q);
$('[data-explain]').addEventListener('click', () => aiAsk('Explícame paso a paso el ejercicio que está cargado en el resolvedor: qué modelo es, por qué, y cómo interpretar cada resultado.'));

// ---------- Acceso del asistente ----------
provide('resolvedor', {
  load(next) {
    spec = { unidad: 'hora', ...next };
    modes.lambda = modes.mu = 'tasa';
    buildForm();
    render();
    flashResults();
    return summarize(lastRun);
  },
});
provide('app', {
  state: () => ({ pagina: 'resolvedor', ejercicio_cargado: summarize(lastRun) }),
  apply: () => ({ ok: false, error: 'Esta acción es de la página principal del proyecto; aquí usa mostrar_en_resolvedor.' }),
  restore: () => ({ ok: false, error: 'Esta acción es de la página principal del proyecto.' }),
});

// ---------- Pie de página ----------
function renderFooter(el) {
  const models = Object.values(MODELS);
  el.innerHTML = `
    <div class="max-w-6xl mx-auto px-4 sm:px-8 py-10 grid grid-cols-2 lg:grid-cols-12 gap-x-8 gap-y-10">
      <div class="col-span-2 lg:col-span-4 space-y-4">
        <a href="/" class="inline-flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" width="28" height="28" class="rounded-[7px]" />
          <span class="font-semibold text-ink">Opti<span class="text-accent">Queue</span></span>
        </a>
        <p class="text-sm text-slate-500 max-w-sm">Módulo de OptiQueue para analizar cualquier sistema de colas. Los cálculos se ejecutan en tu navegador y están verificados con pruebas automáticas contra valores de referencia.</p>
      </div>
      <div class="lg:col-span-3">
        <h2 class="rv-foot-h">Modelos</h2>
        <ul class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">${models.map((m) => `<li class="text-slate-600"><span class="font-mono text-[13px]">${m.kendall}</span></li>`).join('')}</ul>
      </div>
      <div class="lg:col-span-2">
        <h2 class="rv-foot-h">Producto</h2>
        <ul class="mt-3 space-y-2 text-sm">
          <li><a href="/" class="text-slate-600 hover:text-ink">Panel del caso</a></li>
          <li><a href="/#gemelo" class="text-slate-600 hover:text-ink">Gemelo digital</a></li>
          <li><a href="/informe.html" class="text-slate-600 hover:text-ink">Resumen imprimible</a></li>
          <li><a href="/descargas/OptiQueue_Informe_Final.pdf" download class="text-slate-600 hover:text-ink">Informe técnico (PDF)</a></li>
        </ul>
      </div>
      <div class="col-span-2 lg:col-span-3">
        <h2 class="rv-foot-h">Base metodológica</h2>
        <ul class="mt-3 space-y-2 text-sm text-slate-500">
          <li>Taha, H. <em>Investigación de operaciones</em>. Pearson.</li>
          <li>Hillier, F. y Lieberman, G. <em>Introducción a la investigación de operaciones</em>. McGraw-Hill.</li>
          <li>Gross, D. et al. <em>Fundamentals of Queueing Theory</em>. Wiley.</li>
        </ul>
      </div>
    </div>
    <div class="border-t border-line">
      <div class="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
        <p>© ${new Date().getFullYear()} OptiQueue · Erlang B y C, Pollaczek-Khinchine y procesos de nacimiento y muerte.</p>
        <button type="button" class="inline-flex items-center gap-1.5 self-start sm:self-auto text-slate-600 hover:text-ink cursor-pointer" data-top>Volver arriba<i data-lucide="arrow-up" class="w-3.5 h-3.5"></i></button>
      </div>
    </div>`;
  el.querySelector('[data-top]').addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }));
}

setupTheme();
buildForm();
render();
renderFooter($('#pie'));
// El asistente solo aparece si el administrador lo tiene encendido (ASISTENTE_IA)
const aiMount = $('[data-ai-mount]');
const explainBtn = $('[data-explain]');
aiMount.hidden = true;
explainBtn.hidden = true;
assistantAvailable().then((ok) => {
  if (!ok) return aiMount.remove();
  aiMount.hidden = false;
  explainBtn.hidden = false;
  renderAssistant({ page: 'resolvedor', mount: aiMount });
});
refreshIcons();

// Pantalla de carga: se retira cuando la página ya está dibujada
const splash = document.getElementById('splash');
if (splash) {
  const wait = Math.max(0, 900 - (performance.now() - (window.__splashStart ?? 0)));
  const hide = () => {
    splash.classList.add('is-done');
    document.documentElement.classList.remove('splash-lock');
    setTimeout(() => splash.remove(), 600);
  };
  const ready = () => requestAnimationFrame(() => setTimeout(hide, wait));
  if (document.fonts?.ready) Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(ready);
  else ready();
}
