import { mmc } from '../lib/queue.js';
import { num, pct, seconds, usd } from '../lib/format.js';
import { SENS_PARAMS, optimalityRange, paramDef, solveWith, sweep, tornado } from '../lib/sensitivity.js';
import { sectionHead } from './common.js';

/** Valor de un parámetro con su unidad. `precise` añade decimales para los umbrales. */
function fmtVal(def, v, precise = false) {
  if (v === null || v === undefined) return '—';
  const d = precise ? 2 : def.decimals;
  if (def.money) return `${usd(v, d)}/h`;
  if (def.key === 'wq') return v < 1 ? `${num(v, 2)} min (${num(v * 60, 0)} s)` : `${num(v, precise ? 2 : v % 1 ? 2 : 0)} min`;
  return `${num(v, def.key === 'lambda' && !precise ? 0 : d === 0 ? 0 : Math.min(d, 2))} ${def.unit}`;
}

const relChange = (v, base) => (v === null ? '' : `${v >= base ? '+' : '−'}${num(Math.abs(v / base - 1) * 100, 1)} %`);

export function renderSensitivity(el, P, opt) {
  const x0 = opt.x;
  const ranges = Object.fromEntries(SENS_PARAMS.map((d) => [d.key, optimalityRange(P, d, x0)]));
  const tor = tornado(P, x0);
  let def = paramDef('cw');
  let value = def.get(P);

  el.innerHTML = `
    ${sectionHead({
      n: 4,
      id: 'h-sensibilidad',
      title: 'Análisis de sensibilidad',
      desc: `¿Qué pasa si los datos del enunciado cambian? Mueve un parámetro y mira si ${x0} ventanillas siguen siendo la mejor opción.`,
    })}

    <div class="panel overflow-hidden">
      <div class="px-4 sm:px-6 pt-5 pb-4 border-b border-line flex flex-wrap items-center justify-between gap-3">
        <div class="seg-sm" role="group" aria-label="Parámetro a variar">
          ${SENS_PARAMS.map((d) => `<button type="button" data-param="${d.key}" aria-pressed="${d === def}" title="${d.label}">${d.sym}</button>`).join('')}
        </div>
        <button type="button" class="chip-btn" data-reset></button>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-[1fr_20rem]">
        <div class="p-4 sm:p-6 space-y-4 min-w-0">
          <div class="flex items-center gap-4">
            <label for="sensSlider" class="sr-only" data-slider-label></label>
            <output for="sensSlider" class="min-w-[7.5rem] text-2xl font-semibold text-ink tabular-nums" data-out></output>
            <input id="sensSlider" type="range" class="slider flex-1" />
          </div>
          <figure>
            <svg viewBox="0 0 600 230" class="w-full h-auto" role="img" data-chart></svg>
            <figcaption class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span class="inline-flex items-center gap-1.5"><span class="w-4 h-0.5 bg-accent"></span>Número óptimo de ventanillas x*</span>
              <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-accent-soft border border-accent/30"></span>Zona donde x* = ${x0}</span>
              <span class="inline-flex items-center gap-1.5"><span class="w-4 border-t border-dashed border-slate-400"></span>Valor del enunciado</span>
            </figcaption>
          </figure>
          <p class="text-sm text-slate-600" data-range-text></p>
        </div>
        <aside class="p-4 sm:p-6 border-t lg:border-t-0 lg:border-l border-line space-y-4" aria-live="polite" data-result></aside>
      </div>
    </div>

    <div class="panel overflow-x-auto">
      <table class="table w-full min-w-[780px] text-sm">
        <caption class="text-left px-4 sm:px-6 pt-5 pb-1">
          <span class="block text-sm font-medium text-ink">Rangos de optimalidad</span>
          <span class="block text-xs text-slate-500 mt-0.5">Intervalo de cada parámetro (con los demás fijos) en el que x* = ${x0} sigue siendo óptimo, y qué conviene fuera de él.</span>
        </caption>
        <thead>
          <tr>
            <th scope="col" class="!pl-4 sm:!pl-6">Parámetro</th>
            <th scope="col">Enunciado</th>
            <th scope="col">x* = ${x0} mientras esté entre</th>
            <th scope="col">Si baja de ahí</th>
            <th scope="col">Si sube de ahí</th>
            <th scope="col">−20 %</th>
            <th scope="col" class="!pr-4 sm:!pr-6">+20 %</th>
          </tr>
        </thead>
        <tbody>
          ${SENS_PARAMS.map((d) => {
            const r = ranges[d.key];
            const t = tor.find((row) => row.def === d);
            const xCell = (row) => `<span class="${row.x === x0 ? 'text-slate-500' : 'font-medium text-ink'}">${row.x ?? '—'}</span>`;
            return `
            <tr>
              <th scope="row" class="!text-left !font-normal !text-sm !text-ink !pl-4 sm:!pl-6">${d.label} <span class="text-slate-400">${d.sym}</span></th>
              <td>${fmtVal(d, r.base)}</td>
              <td class="whitespace-nowrap text-ink">${r.low.value === null ? `≤ ${fmtVal(d, d.min)}` : fmtVal(d, r.low.value, true)} – ${r.high.value === null ? 'sin límite*' : fmtVal(d, r.high.value, true)}</td>
              <td>${r.low.x === null ? '—' : `abrir ${r.low.x}`}</td>
              <td>${r.high.x === null ? '—' : `abrir ${r.high.x}`}</td>
              <td>${xCell(t.down)}</td>
              <td class="!pr-4 sm:!pr-6">${xCell(t.up)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <p class="px-4 sm:px-6 pb-5 pt-2 text-xs text-slate-500">
        * Dentro del rango estudiado (hasta ${fmtVal(paramDef('wq'), paramDef('wq').max)}). Las columnas ±20 % muestran el nuevo x*; en gris si no cambia.
      </p>
    </div>

    <div class="rounded-lg border border-line bg-accent-soft/50 px-4 sm:px-5 py-4 text-sm text-slate-700" data-insight></div>`;

  const $ = (s) => el.querySelector(s);
  const slider = $('#sensSlider');

  // ---------- Conclusión general ----------
  const span = (key) => {
    const r = ranges[key];
    const lo = r.low.value === null ? null : (r.low.value / r.base - 1) * 100;
    const hi = r.high.value === null ? null : (r.high.value / r.base - 1) * 100;
    return { lo, hi };
  };
  const cw = span('cw');
  const mu = span('mu');
  const lam = span('lambda');
  $('[data-insight]').innerHTML = `
    <p class="font-medium text-ink">Conclusión</p>
    <p class="mt-1">La solución es <strong class="text-ink">robusta frente a los costos</strong>: el costo de espera puede bajar un ${num(Math.abs(cw.lo), 0)} % o subir un ${num(cw.hi, 0)} % sin que cambie la recomendación,
    y el límite de espera solo importaría si fuese menor que ${seconds(mmc(x0, P).Wq, 0)}.
    En cambio es <strong class="text-ink">sensible a la operación</strong>: basta con que cada ventanilla atienda un ${num(Math.abs(mu.lo), 1)} % menos (μ ≈ ${num(ranges.mu.low.value, 1)} pas/h)
    o que la demanda suba un ${num(lam.hi, 1)} % para que convenga abrir ${ranges.mu.low.x}. Vale la pena medir bien μ y λ antes de decidir.</p>`;

  // ---------- Gráfico escalonado ----------
  let W = 600;
  const H = 230, L = 40, R = 12, T = 12, B = 34;
  let pts = [];
  let yMin = 0, yMax = 1;
  const sx = (v) => L + ((v - def.min) / (def.max - def.min)) * (W - L - R);
  const sy = (x) => T + ((yMax - x) / (yMax - yMin)) * (H - T - B);

  const drawChart = () => {
    W = Math.round($('[data-chart]').getBoundingClientRect().width) || 600;
    $('[data-chart]').setAttribute('viewBox', `0 0 ${W} ${H}`);
    pts = sweep(P, def, 160);
    const xs = pts.map((p) => p.x).filter((x) => x !== null);
    yMin = Math.max(0, Math.min(...xs) - 1);
    yMax = Math.max(...xs) + 1;
    const yStep = yMax - yMin > 14 ? 4 : yMax - yMin > 7 ? 2 : 1;
    const r = ranges[def.key];
    const bandLo = r.low.value ?? def.min;
    const bandHi = r.high.value ?? def.max;

    let d = '';
    let prev = null;
    for (const p of pts) {
      if (p.x === null) { prev = null; continue; }
      d += prev === null ? `M${sx(p.v).toFixed(1)},${sy(p.x).toFixed(1)}` : `H${sx(p.v).toFixed(1)}V${sy(p.x).toFixed(1)}`;
      prev = p;
    }
    const yTicks = [];
    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) yTicks.push(y);
    const nx = W < 480 ? 3 : 5;
    const xTicks = Array.from({ length: nx }, (_, i) => def.min + ((def.max - def.min) * i) / (nx - 1));
    const base = def.get(P);

    $('[data-chart]').setAttribute('aria-label', `Número óptimo de ventanillas según ${def.label.toLowerCase()}. Con el valor del enunciado (${fmtVal(def, base)}) el óptimo es ${x0}.`);
    $('[data-chart]').innerHTML = `
      <rect x="${sx(bandLo)}" y="${T}" width="${Math.max(1, sx(bandHi) - sx(bandLo))}" height="${H - T - B}" class="fill-accent-soft" />
      ${yTicks.map((y) => `
        <line x1="${L}" x2="${W - R}" y1="${sy(y)}" y2="${sy(y)}" class="stroke-line" />
        <text x="${L - 8}" y="${sy(y) + 4}" text-anchor="end" class="fill-slate-500 text-[11px]">${y}</text>`).join('')}
      ${xTicks.map((v) => `<text x="${sx(v)}" y="${H - 12}" text-anchor="middle" class="fill-slate-500 text-[11px]">${def.money ? '$' : ''}${num(v, def.key === 'wq' || def.key === 'mu' ? 1 : 0)}</text>`).join('')}
      <text x="${W - R}" y="${H - 1}" text-anchor="end" class="fill-slate-400 text-[10px]">${def.label} (${def.unit})</text>
      <text x="${L - 30}" y="${T + 2}" class="fill-slate-400 text-[10px]" transform="rotate(-90 ${L - 30} ${T + 2})" text-anchor="end">x*</text>
      <line x1="${sx(base)}" x2="${sx(base)}" y1="${T}" y2="${H - B}" class="stroke-slate-400" stroke-dasharray="4 4" />
      <path d="${d}" fill="none" class="stroke-accent" stroke-width="2.5" stroke-linejoin="round" />
      <g data-marker>
        <line data-mline y1="${T}" y2="${H - B}" class="stroke-ink" stroke-opacity="0.25" />
        <circle data-mdot r="5.5" class="fill-accent stroke-surface" stroke-width="2.5" />
        <text data-mtext text-anchor="middle" class="fill-ink text-[12px] font-semibold"></text>
      </g>`;
  };

  const placeMarker = (v, x) => {
    const g = $('[data-marker]');
    g.style.display = x === null ? 'none' : '';
    if (x === null) return;
    const cx = sx(v), cy = sy(x);
    $('[data-mline]').setAttribute('x1', cx);
    $('[data-mline]').setAttribute('x2', cx);
    $('[data-mdot]').setAttribute('cx', cx);
    $('[data-mdot]').setAttribute('cy', cy);
    const t = $('[data-mtext]');
    t.setAttribute('x', Math.min(W - R - 10, Math.max(L + 10, cx)));
    t.setAttribute('y', cy - 11);
    t.textContent = `x* = ${x}`;
  };

  // ---------- Resultado ----------
  const update = () => {
    const s = solveWith(P, def, value);
    $('[data-out]').textContent = fmtVal(def, value);
    slider.setAttribute('aria-valuetext', fmtVal(def, value));
    placeMarker(value, s.x);

    const res = $('[data-result]');
    if (s.x === null) {
      res.innerHTML = `<p class="font-medium text-bad">Sin solución factible</p><p class="text-sm text-slate-600">Ninguna cantidad razonable de ventanillas cumple el límite de espera.</p>`;
      return;
    }
    const b = s.opt.best;
    const keep = mmc(x0, s.params);
    const delta = s.x - x0;
    let verdict;
    if (delta === 0) verdict = `<p class="text-sm text-slate-600">${x0} ventanillas siguen siendo la mejor opción.</p>`;
    else if (!keep.stable) verdict = `<p class="text-sm text-slate-600">Con ${x0} ventanillas el sistema <strong class="text-bad">no da abasto</strong> (ρ ≥ 1): la cola crecería sin límite.</p>`;
    else if (!keep.meetsSla) verdict = `<p class="text-sm text-slate-600">Con ${x0} ventanillas la espera sería de ${seconds(keep.Wq, 0)}: <strong class="text-bad">no cumple el límite</strong>.</p>`;
    else verdict = `<p class="text-sm text-slate-600">Mantener ${x0} costaría ${usd(keep.totalCost)}/h, es decir <strong class="text-ink">${usd(keep.totalCost - b.totalCost)}/h más</strong> que abrir ${s.x}.</p>`;

    res.innerHTML = `
      <div>
        <p class="text-xs text-slate-500">Con ${def.sym} = ${fmtVal(def, value)}</p>
        <p class="mt-1 flex items-baseline gap-2">
          <span class="text-3xl font-semibold text-ink tabular-nums">${s.x}</span>
          <span class="text-sm text-slate-500">ventanillas</span>
          ${delta ? `<span class="ml-1 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${delta > 0 ? 'bg-bad/10 text-bad' : 'bg-ok/10 text-ok'}">${delta > 0 ? '+' : '−'}${Math.abs(delta)} vs. ${x0}</span>` : `<span class="ml-1 rounded px-1.5 py-0.5 text-xs font-medium bg-accent-soft text-accent">igual</span>`}
        </p>
      </div>
      <dl>
        <div class="kv"><dt>Costo mínimo</dt><dd>${usd(b.totalCost)}/h</dd></div>
        <div class="kv"><dt>Espera promedio</dt><dd>${seconds(b.Wq, 1)}</dd></div>
        <div class="kv"><dt>Utilización</dt><dd>${pct(b.rho, 1)}</dd></div>
      </dl>
      ${verdict}`;
  };

  const rangeText = () => {
    const r = ranges[def.key];
    const lo = r.low.value === null ? null : fmtVal(def, r.low.value, true);
    const hi = r.high.value === null ? null : fmtVal(def, r.high.value, true);
    let txt = `<strong class="text-ink">x* = ${x0}</strong> se mantiene `;
    if (lo && hi) txt += `con ${def.label.toLowerCase()} entre <strong class="text-ink">${lo}</strong> y <strong class="text-ink">${hi}</strong> (${relChange(r.low.value, r.base)} / ${relChange(r.high.value, r.base)} respecto al enunciado).`;
    else if (lo) txt += `mientras ${def.label.toLowerCase()} sea mayor que <strong class="text-ink">${lo}</strong> (${relChange(r.low.value, r.base)}).`;
    else if (hi) txt += `mientras ${def.label.toLowerCase()} sea menor que <strong class="text-ink">${hi}</strong> (${relChange(r.high.value, r.base)}).`;
    else txt += 'en todo el rango estudiado.';
    const parts = [];
    if (r.low.x !== null) parts.push(`por debajo conviene abrir ${r.low.x}`);
    if (r.high.x !== null) parts.push(`por encima ${r.low.x !== null ? '' : 'conviene abrir '}${r.high.x}`.replace('encima ', r.low.x !== null ? 'encima, ' : 'encima '));
    if (parts.length) txt += ` ${parts.join('; ').replace(/^p/, 'P')}.`;
    $('[data-range-text]').innerHTML = txt;
  };

  const selectParam = (key) => {
    def = paramDef(key);
    value = def.get(P);
    el.querySelectorAll('[data-param]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.param === key)));
    Object.assign(slider, { min: def.min, max: def.max, step: def.step });
    slider.value = String(value);
    $('[data-slider-label]').textContent = `${def.label} (${def.unit})`;
    $('[data-reset]').textContent = `Enunciado · ${fmtVal(def, def.get(P))}`;
    drawChart();
    rangeText();
    update();
  };

  el.querySelectorAll('[data-param]').forEach((b) => b.addEventListener('click', () => selectParam(b.dataset.param)));
  slider.addEventListener('input', () => {
    value = Number(slider.value);
    update();
  });
  $('[data-reset]').addEventListener('click', () => {
    value = def.get(P);
    slider.value = String(value);
    update();
  });

  let lastW = 0;
  new ResizeObserver(() => {
    const w = Math.round($('[data-chart]').getBoundingClientRect().width);
    if (w && w !== lastW) {
      lastW = w;
      drawChart();
      placeMarker(value, solveWith(P, def, value).x);
    }
  }).observe($('[data-chart]'));

  selectParam(def.key);
}
