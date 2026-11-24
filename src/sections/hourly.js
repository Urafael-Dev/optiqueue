import { DEMAND_PROFILE, hourlyPlan } from '../lib/hourly.js';
import { num, pct, seconds, usd, usdCompact } from '../lib/format.js';
import { lifecycle, onAbort, sectionHead } from './common.js';

const hh = (h) => `${String(h).padStart(2, '0')}:00`;

export function renderHourly(el, P, opt) {
  const fixedOptions = [opt.x, P.baseWindows];
  let scale = 1;
  let cmp = 0; // índice en fixedOptions
  let hover = null;
  let plan;

  el.innerHTML = `
    ${sectionHead({
      n: 5,
      id: 'h-demanda',
      title: 'Demanda por hora del día',
      desc: `El caso usa λ = ${P.lambda} pas/h, que corresponde a la hora pico. Con un perfil de llegadas de 24 horas se calcula cuántas ventanillas abrir en cada franja y cuánto se ahorra frente a dejarlas fijas.`,
    })}

    <div class="panel overflow-hidden">
      <div class="px-4 sm:px-6 pt-5 pb-4 border-b border-line grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="space-y-2">
          <label for="hourScale" class="text-sm font-medium text-ink flex justify-between">
            Intensidad de la demanda <output for="hourScale" class="tabular-nums text-slate-500 font-normal" data-scale-out></output>
          </label>
          <input id="hourScale" type="range" class="slider" min="0.8" max="1.2" step="0.05" value="1" />
          <div class="slider-ticks" aria-hidden="true"><span>80 %</span><span>100 %</span><span>120 %</span></div>
        </div>
        <div class="space-y-2 md:justify-self-end">
          <p class="text-sm font-medium text-ink">Comparar con</p>
          <div class="seg-sm" role="group" aria-label="Escenario de comparación">
            ${fixedOptions.map((c, i) => `<button type="button" data-cmp="${i}" aria-pressed="${i === cmp}">${c} fijas${c === P.baseWindows ? ' (actual)' : ' (óptimo pico)'}</button>`).join('')}
          </div>
        </div>
      </div>

      <dl class="grid grid-cols-2 lg:grid-cols-4 border-b border-line" data-kpis></dl>

      <div class="p-4 sm:p-6">
        <figure>
          <svg viewBox="0 0 720 270" class="w-full h-auto select-none" role="img" data-chart></svg>
          <figcaption class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-slate-200"></span>Llegadas λ (pas/h, eje izq.)</span>
            <span class="inline-flex items-center gap-1.5"><span class="w-4 h-0.5 bg-accent"></span>Ventanillas a abrir (eje der.)</span>
            <span class="inline-flex items-center gap-1.5"><span class="w-4 border-t-2 border-dashed border-bad"></span><span data-fixed-label></span></span>
            <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-bad/15"></span>Ventanillas que sobran</span>
          </figcaption>
        </figure>
        <p class="mt-3 min-h-[1.5rem] text-sm text-slate-600 tabular-nums" aria-live="polite" data-readout></p>
      </div>

      <details class="border-t border-line group">
        <summary class="px-4 sm:px-6 py-3 text-sm font-medium text-accent cursor-pointer select-none list-none flex items-center gap-1.5">
          <i data-lucide="chevron-right" class="w-4 h-4 transition-transform group-open:rotate-90"></i>Ver la tabla hora por hora
        </summary>
        <div class="overflow-x-auto border-t border-line">
          <table class="table w-full min-w-[700px] text-sm">
            <thead><tr>
              <th scope="col" class="!pl-4 sm:!pl-6">Hora</th><th scope="col">λ (pas/h)</th><th scope="col">Ventanillas</th><th scope="col">ρ</th>
              <th scope="col">Espera W<sub>q</sub></th><th scope="col">Costo plan</th><th scope="col" class="!pr-4 sm:!pr-6" data-th-fixed></th>
            </tr></thead>
            <tbody data-rows></tbody>
          </table>
        </div>
      </details>
    </div>

    <p class="text-xs text-slate-500">
      Supuestos: el perfil de llegadas es ilustrativo (dos olas de vuelos, pico de ${P.lambda} pas/h igual al del caso) y cada hora se resuelve como un
      sistema M/M/c estacionario independiente (método SIPP). En la práctica las ventanillas se agrupan en turnos, por lo que el ahorro real sería algo menor.
    </p>`;

  const $ = (s) => el.querySelector(s);

  // ---------- Gráfico ----------
  let W = 720;
  const H = 270, T = 14, B = 30;
  let L = 44, R = 40, bw = 0;
  const n = DEMAND_PROFILE.length;
  const bx = (h) => L + h * bw;

  const drawChart = () => {
    W = Math.round($('[data-chart]').getBoundingClientRect().width) || 720;
    L = W < 480 ? 32 : 44;
    R = W < 480 ? 26 : 40;
    bw = (W - L - R) / n;
    $('[data-chart]').setAttribute('viewBox', `0 0 ${W} ${H}`);
    const fixedC = fixedOptions[cmp];
    const lamMax = Math.ceil((Math.max(...plan.rows.map((r) => r.lambda)) * 1.1) / 50) * 50;
    const winMax = Math.max(20, fixedC + 2);
    const yL = (v) => T + (1 - v / lamMax) * (H - T - B);
    const yR = (v) => T + (1 - v / winMax) * (H - T - B);

    // Escalón del plan y área sobrante hasta la línea fija
    let step = '';
    let waste = '';
    plan.rows.forEach((r, h) => {
      const x0 = bx(h), x1 = bx(h + 1), y = yR(r.x);
      step += `${h ? 'L' : 'M'}${x0.toFixed(1)},${y.toFixed(1)}L${x1.toFixed(1)},${y.toFixed(1)}`;
      if (fixedC > r.x) waste += `<rect x="${x0}" y="${yR(fixedC)}" width="${bw}" height="${y - yR(fixedC)}" class="fill-bad/10" />`;
    });

    const lamTicks = Array.from({ length: lamMax / 50 + 1 }, (_, i) => i * 50);
    const winTicks = Array.from({ length: Math.floor(winMax / 5) + 1 }, (_, i) => i * 5);

    $('[data-chart]').setAttribute('aria-label', `Llegadas por hora y ventanillas recomendadas. El plan varía entre ${Math.min(...plan.rows.map((r) => r.x))} y ${plan.maxX} ventanillas; la comparación mantiene ${fixedC} todo el día.`);
    $('[data-chart]').innerHTML = `
      ${lamTicks.map((v) => `
        <line x1="${L}" x2="${W - R}" y1="${yL(v)}" y2="${yL(v)}" class="stroke-line" />
        <text x="${L - 8}" y="${yL(v) + 4}" text-anchor="end" class="fill-slate-500 text-[11px]">${v}</text>`).join('')}
      ${winTicks.map((v) => `<text x="${W - R + 8}" y="${yR(v) + 4}" class="fill-accent text-[11px]">${v}</text>`).join('')}
      ${plan.rows.map((r, h) => `<rect x="${bx(h) + Math.min(2, bw * 0.12)}" y="${yL(r.lambda)}" width="${bw - 2 * Math.min(2, bw * 0.12)}" height="${H - B - yL(r.lambda)}" rx="2" class="${hover === h ? 'fill-slate-300' : 'fill-slate-200'}" />`).join('')}
      ${waste}
      <line x1="${L}" x2="${W - R}" y1="${yR(fixedC)}" y2="${yR(fixedC)}" class="stroke-bad" stroke-width="1.5" stroke-dasharray="6 4" />
      <path d="${step}" fill="none" class="stroke-accent" stroke-width="2.5" stroke-linejoin="round" />
      ${plan.rows.map((r, h) => (h % (W < 480 ? 6 : 3) === 0 ? `<text x="${bx(h) + bw / 2}" y="${H - 10}" text-anchor="middle" class="fill-slate-500 text-[11px]">${hh(h).slice(0, 2)}h</text>` : '')).join('')}
      ${hover !== null ? `<text x="${bx(hover) + bw / 2}" y="${yR(plan.rows[hover].x) - 7}" text-anchor="middle" class="fill-accent text-[12px] font-semibold">${plan.rows[hover].x}</text>` : ''}
      ${plan.rows.map((_, h) => `<rect x="${bx(h)}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent" data-h="${h}" />`).join('')}`;
  };

  const readout = () => {
    const fixedC = fixedOptions[cmp];
    const out = $('[data-readout]');
    if (hover === null) {
      out.innerHTML = '<span class="text-slate-400">Pasa el cursor (o toca) sobre una hora para ver el detalle.</span>';
      return;
    }
    const r = plan.rows[hover];
    const f = r.fixed[cmp];
    out.innerHTML = `<strong class="text-ink">${hh(r.h)}–${hh((r.h + 1) % 24)}</strong> · λ = ${r.lambda} pas/h ·
      abrir <strong class="text-accent">${r.x}</strong> (espera ${seconds(r.best.Wq, 0)}, ${usd(r.best.totalCost, 0)}/h) ·
      con ${fixedC} fijas: ${usd(f.totalCost, 0)}/h${f.totalCost - r.best.totalCost > 0.005 ? ` <span class="text-bad">(+${usd(f.totalCost - r.best.totalCost, 0)})</span>` : ''}`;
  };

  // ---------- Indicadores y tabla ----------
  const drawKpis = () => {
    const f = plan.fixed[cmp];
    const save = f.cost - plan.dynamic.cost;
    const kpi = (label, value, sub, cls = 'text-ink') => `
      <div class="px-4 sm:px-6 py-4 border-line [&:nth-child(2n)]:border-l lg:[&:not(:first-child)]:border-l [&:nth-child(n+3)]:border-t lg:[&:nth-child(n+3)]:border-t-0">
        <dt class="text-xs text-slate-500">${label}</dt>
        <dd class="mt-1 text-xl font-semibold tabular-nums ${cls}">${value}</dd>
        <dd class="text-xs text-slate-500 tabular-nums">${sub}</dd>
      </div>`;
    $('[data-kpis]').innerHTML =
      kpi('Plan por horas', `${usd(plan.dynamic.cost, 0)}/día`, `${num(plan.dynamic.windowHours, 0)} ventanilla-horas`) +
      kpi(`${f.c} ventanillas fijas`, `${usd(f.cost, 0)}/día`, `${num(f.windowHours, 0)} ventanilla-horas`) +
      kpi('Ahorro diario', usd(save, 0), `${pct(save / f.cost, 1)} menos`, 'text-ok') +
      kpi('Ahorro anual', usdCompact(save * P.daysPerYear), `${P.daysPerYear} días de operación`, 'text-ok');

    $('[data-fixed-label]').textContent = `${f.c} ventanillas fijas`;
    $('[data-th-fixed]').textContent = `Costo con ${f.c} fijas`;
    $('[data-rows]').innerHTML = plan.rows
      .map((r) => {
        const fx = r.fixed[cmp];
        return `<tr class="${r.lambda === plan.peak.lambda ? 'bg-accent-soft/50' : ''}">
          <td class="!text-left !pl-4 sm:!pl-6">${hh(r.h)}–${hh((r.h + 1) % 24)}</td>
          <td>${r.lambda}</td>
          <td class="font-medium text-ink">${r.x}</td>
          <td>${pct(r.best.rho, 0)}</td>
          <td>${seconds(r.best.Wq, 0)}</td>
          <td>${usd(r.best.totalCost)}</td>
          <td class="!pr-4 sm:!pr-6 ${fx.meetsSla ? 'text-slate-500' : 'text-bad'}">${fx.stable ? usd(fx.totalCost) : 'no da abasto'}</td>
        </tr>`;
      })
      .join('');
  };

  const recompute = () => {
    plan = hourlyPlan(P, DEMAND_PROFILE, { scale, fixed: fixedOptions });
    $('[data-scale-out]').textContent = `${num(scale * 100, 0)} % · pico ${plan.peak.lambda} pas/h`;
    drawKpis();
    drawChart();
    readout();
  };

  // ---------- Eventos ----------
  $('#hourScale').addEventListener('input', (e) => {
    scale = Number(e.target.value);
    recompute();
  });
  el.querySelectorAll('[data-cmp]').forEach((b) =>
    b.addEventListener('click', () => {
      cmp = Number(b.dataset.cmp);
      el.querySelectorAll('[data-cmp]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
      recompute();
    }),
  );
  const svg = $('[data-chart]');
  const setHover = (h) => {
    if (h === hover) return;
    hover = h;
    drawChart();
    readout();
  };
  svg.addEventListener('pointermove', (e) => {
    const t = e.target.closest('[data-h]');
    if (t) setHover(Number(t.dataset.h));
  });
  svg.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && setHover(null));

  let lastW = 0;
  const ro = new ResizeObserver(() => {
    const w = Math.round(svg.getBoundingClientRect().width);
    if (w && w !== lastW) { lastW = w; drawChart(); }
  });
  ro.observe(svg);
  onAbort(lifecycle(el), () => ro.disconnect());

  recompute();
}
