import { minutes, num, pct, seconds, usd, usdCompact } from '../lib/format.js';
import { refreshIcons } from '../ui.js';
import { sub } from './common.js';

/**
 * Recorrido guiado de la resolución: un paso por pantalla, con una idea clave,
 * la explicación en lenguaje sencillo y un apoyo visual.
 */
export function renderWalkthrough(el, dialog, P, opt, sv) {
  const b = opt.best;
  const feas = opt.feasible;
  const unstable = opt.all.filter((s) => !s.stable);
  const slaMin = P.wqMaxH * 60;

  const takeaway = (text) =>
    `<p class="flex gap-2.5 rounded-lg bg-accent-soft/70 border border-accent/15 px-4 py-3 text-sm text-ink"><span class="font-medium text-accent shrink-0">Idea clave</span><span>${text}</span></p>`;

  // ---------- Paso 1: el problema ----------
  const step1 = `
    <p>La sala de migración recibe <strong>${P.lambda} pasajeros por hora</strong> y cada ventanilla atiende <strong>${P.mu} por hora</strong>.
    Hay que decidir cuántas ventanillas abrir.</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div class="rounded-lg border border-line p-4">
        <p class="text-sm font-medium text-ink">Si abro más ventanillas…</p>
        <p class="mt-1 text-sm">Sube el costo de operación: <strong>${usd(P.cs, 0)}/h</strong> por cada una.</p>
      </div>
      <div class="rounded-lg border border-line p-4">
        <p class="text-sm font-medium text-ink">Si abro menos…</p>
        <p class="mt-1 text-sm">Crece la cola, y cada pasajero esperando cuesta <strong>${usd(P.cw, 0)}/h</strong>.</p>
      </div>
    </div>
    <dl class="rounded-lg bg-slate-50 border border-line px-4">
      <div class="kv"><dt>Decisión</dt><dd><span class="font-mono">x</span> = ventanillas abiertas (número entero)</dd></div>
      <div class="kv"><dt>Objetivo</dt><dd>minimizar <span class="font-mono">y</span> = costo total por hora</dd></div>
      <div class="kv"><dt>Restricción</dt><dd>espera promedio en cola ≤ ${num(slaMin, 0)} minutos</dd></div>
    </dl>
    ${takeaway('Buscamos el equilibrio entre pagar ventanillas y pagar por la espera de los pasajeros.')}`;

  // ---------- Paso 2: evaluar escenarios ----------
  const step2 = `
    <p>Para cada número de ventanillas, el modelo de colas M/M/c (fórmula de Erlang C) calcula cuántos pasajeros hay en cola
    (${sub('L', 'q')}), cuánto esperan (${sub('W', 'q')}) y el costo total <span class="font-mono">CT = ${P.cs}·x + ${P.cw}·${sub('L', 'q')}</span>.</p>
    <div class="overflow-x-auto rounded-lg border border-line">
      <table class="table w-full text-sm whitespace-nowrap">
        <thead class="bg-slate-50"><tr><th scope="col">x</th><th scope="col">Utilización</th><th scope="col">En cola</th><th scope="col">Espera</th><th scope="col">Operación</th><th scope="col">Espera ($)</th><th scope="col">Costo total</th></tr></thead>
        <tbody>
          ${unstable
            .map(
              (s) => `<tr class="text-slate-400"><td class="!text-left">${s.c}</td><td class="text-bad">${pct(s.rho)}</td><td colspan="5" class="!text-left text-bad">Inestable: la cola crece sin fin</td></tr>`,
            )
            .join('')}
          ${feas
            .map(
              (s) => `<tr><td class="!text-left">${s.c}</td><td>${pct(s.rho)}</td><td>${num(s.Lq, 2)}</td><td>${minutes(s.Wq, 2)}</td>
                <td class="text-slate-500">${usd(s.serviceCost, 0)}</td><td class="text-slate-500">${usd(s.waitCost)}</td><td class="font-medium text-ink">${usd(s.totalCost)}</td></tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
    ${takeaway(`Con ${unstable.map((s) => s.c).join(', ')} ventanillas la capacidad (${unstable[0] ? unstable[0].c * P.mu : ''} pas/h) no supera la demanda, así que el análisis empieza en x = ${feas[0].c}.`)}`;

  // ---------- Paso 3: restricción de espera ----------
  const step3 = `
    <p>Ahora se descartan los escenarios en los que la espera promedio supera ${num(slaMin, 0)} minutos. La línea roja marca el límite.</p>
    <div class="space-y-2" role="img" aria-label="Espera promedio de cada escenario frente al límite de ${num(slaMin, 0)} minutos; todos están por debajo.">
      ${feas
        .map(
          (s) => `
        <div class="grid grid-cols-[2.5rem_1fr_5.5rem] items-center gap-3 text-sm">
          <span class="text-slate-500 num">x = ${s.c}</span>
          <div class="relative h-5 rounded bg-slate-100">
            <div class="absolute inset-y-0 left-0 rounded ${s.meetsSla ? 'bg-ok/70' : 'bg-bad/70'}" style="width:${Math.min(100, ((s.Wq * 60) / (slaMin * 1.1)) * 100).toFixed(1)}%"></div>
            <div class="absolute inset-y-[-3px] w-0.5 bg-bad" style="left:${((1 / 1.1) * 100).toFixed(1)}%"></div>
          </div>
          <span class="text-right num text-ink">${minutes(s.Wq, 2)}</span>
        </div>`,
        )
        .join('')}
      <div class="grid grid-cols-[2.5rem_1fr_5.5rem] gap-3 text-xs text-slate-500">
        <span></span><span class="text-right pr-[9%] text-bad">límite ${num(slaMin, 0)} min</span><span></span>
      </div>
    </div>
    ${takeaway(`Todos los escenarios estables cumplen: incluso con ${feas[0].c} ventanillas se espera ${minutes(feas[0].Wq, 1)}. La restricción queda como <span class="font-mono">x ≥ ${opt.xSla}</span>, y la decisión real la toma el costo.`)}`;

  // ---------- Paso 4: linealizar para PuLP ----------
  const W = 480;
  const H = 220;
  const pad = { l: 44, r: 12, t: 12, b: 28 };
  const xs = feas.map((s) => s.c);
  const ys = feas.map((s) => s.totalCost);
  const yMin = Math.floor((Math.min(...ys) - 40) / 50) * 50;
  const yMax = Math.ceil((Math.max(...ys) + 20) / 50) * 50;
  const px = (x) => pad.l + ((x - xs[0]) / (xs.at(-1) - xs[0])) * (W - pad.l - pad.r);
  const py = (y) => pad.t + (1 - (y - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);
  const cutLines = opt.cuts
    .map((k) => {
      const x0 = xs[0];
      const x1 = xs.at(-1);
      const active = k.k === b.c - 1 || k.k === b.c;
      return `<line x1="${px(x0)}" y1="${py(k.intercept + k.slope * x0)}" x2="${px(x1)}" y2="${py(k.intercept + k.slope * x1)}"
        stroke="${active ? '#2f5bd3' : '#94a3b8'}" stroke-width="${active ? 1.5 : 1}" stroke-dasharray="${active ? '' : '3 3'}" opacity="${active ? 0.9 : 0.6}" />`;
    })
    .join('');
  const yTicks = [];
  for (let v = yMin; v <= yMax; v += 100) yTicks.push(v);

  const step4 = `
    <p>PuLP resuelve modelos <strong>lineales</strong>, pero el costo total es una curva. El truco: reemplazar la curva por las rectas
    que unen cada par de puntos vecinos (secantes) y exigir que <span class="font-mono">y</span> quede por encima de todas.</p>
    <figure class="rounded-lg border border-line p-3">
      <svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" role="img" aria-label="Costo total por número de ventanillas con las rectas secantes; el punto más bajo es x = ${b.c}.">
        <defs><clipPath id="plot"><rect x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}" /></clipPath></defs>
        ${yTicks.map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${py(v)}" y2="${py(v)}" stroke="#eef1f5" /><text x="${pad.l - 6}" y="${py(v) + 4}" text-anchor="end" font-size="10" fill="#64748b">$${v}</text>`).join('')}
        ${xs.map((x) => `<text x="${px(x)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#64748b">${x}</text>`).join('')}
        <g clip-path="url(#plot)">${cutLines}</g>
        ${feas.map((s) => `<circle cx="${px(s.c)}" cy="${py(s.totalCost)}" r="${s.c === b.c ? 5 : 3.5}" fill="${s.c === b.c ? '#2f5bd3' : '#0f1b2d'}" />`).join('')}
        <text x="${px(b.c)}" y="${py(b.totalCost) + 18}" text-anchor="middle" font-size="11" font-weight="600" fill="#2f5bd3" stroke="#fff" stroke-width="4" paint-order="stroke">x* = ${b.c}</text>
      </svg>
      <figcaption class="mt-1 text-xs text-slate-500">Puntos: costo total real. Líneas: restricciones de PuLP; en azul, las dos que se cruzan en el óptimo.</figcaption>
    </figure>
    <p>Por ejemplo, entre ${b.c} y ${b.c + 1} ventanillas la restricción es
      <span class="font-mono text-ink whitespace-nowrap">y ≥ ${usd(b.totalCost)} + ${num(opt.cuts.find((k) => k.k === b.c).slope, 2)}·(x − ${b.c})</span>.</p>
    <details class="text-sm">
      <summary class="cursor-pointer text-accent">Ver las ${opt.cuts.length} restricciones</summary>
      <ul class="mt-2 space-y-1 font-mono text-[13px] text-ink">
        ${opt.cuts.map((k) => `<li>y ≥ ${num(k.slope, 2)}·x ${k.intercept < 0 ? '−' : '+'} ${num(Math.abs(k.intercept), 2)} <span class="text-slate-400 font-sans text-xs">(entre ${k.k} y ${k.k + 1})</span></li>`).join('')}
      </ul>
    </details>
    ${takeaway('Como la curva tiene forma de “U” (es convexa), la recta más alta en cada entero coincide con el costo real. Así PuLP minimiza exactamente el costo total.')}`;

  // ---------- Paso 5: por qué 15 (análisis marginal) ----------
  const marg = feas.slice(0, -1).map((s, i) => {
    const next = feas[i + 1];
    const saving = s.waitCost - next.waitCost;
    return { from: s.c, to: next.c, saving, worth: saving > P.cs };
  });
  const maxSaving = Math.max(...marg.map((m) => m.saving), P.cs);
  const step5 = `
    <p>El solver encuentra el mínimo, pero la razón se entiende ventanilla por ventanilla: <strong>abrir una más cuesta ${usd(P.cs, 0)}/h</strong>
    y conviene solo si reduce el costo de espera en más de eso.</p>
    <div class="space-y-2" role="img" aria-label="Ahorro en espera por abrir una ventanilla más, comparado con su costo de ${usd(P.cs, 0)} por hora.">
      ${marg
        .map(
          (m) => `
        <div class="grid grid-cols-1 sm:grid-cols-[4.5rem_1fr_11rem] items-center gap-x-3 gap-y-1 text-sm">
          <div class="flex justify-between sm:contents">
            <span class="sm:order-1 text-slate-500 num whitespace-nowrap">${m.from} → ${m.to}</span>
            <span class="sm:order-3 sm:text-right num whitespace-nowrap ${m.worth ? 'text-ok font-medium' : 'text-slate-500'}">ahorra ${usd(m.saving)} · ${m.worth ? 'conviene' : 'no conviene'}</span>
          </div>
          <div class="sm:order-2 relative h-4 sm:h-5 rounded bg-slate-100">
            <div class="absolute inset-y-0 left-0 rounded ${m.worth ? 'bg-ok/70' : 'bg-slate-300'}" style="width:${((m.saving / maxSaving) * 100).toFixed(1)}%"></div>
            <div class="absolute inset-y-[-3px] w-0.5 bg-ink" style="left:${((P.cs / maxSaving) * 100).toFixed(1)}%"></div>
          </div>
        </div>`,
        )
        .join('')}
      <div class="grid grid-cols-1 sm:grid-cols-[4.5rem_1fr_11rem] gap-3 text-xs text-slate-500">
        <span class="hidden sm:block"></span><span>La barra es el ahorro en espera; la línea negra, el costo de ${usd(P.cs, 0)}/h de la ventanilla extra.</span>
      </div>
    </div>
    ${takeaway(`Pasar de ${b.c - 1} a ${b.c} ahorra ${usd(marg.find((m) => m.to === b.c).saving)}/h en espera (más que los ${usd(P.cs, 0)} que cuesta). Pasar de ${b.c} a ${b.c + 1} solo ahorra ${usd(marg.find((m) => m.from === b.c).saving)}/h: ya no compensa. Por eso el óptimo es ${b.c}.`)}`;

  // ---------- Paso 6: resultado ----------
  const step6 = `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-lg overflow-hidden border border-line bg-line">
      ${[
        ['Ventanillas', `${b.c}`],
        ['Costo total', `${usd(b.totalCost)}/h`],
        ['Espera promedio', seconds(b.Wq)],
        ['Utilización', pct(b.rho)],
      ]
        .map(([k, v]) => `<div class="bg-white p-4"><p class="label">${k}</p><p class="mt-1 text-xl font-semibold text-ink num">${v}</p></div>`)
        .join('')}
    </div>
    <p class="font-medium text-ink">Frente a las ${P.baseWindows} ventanillas actuales</p>
    <dl class="rounded-lg border border-line px-4">
      <div class="kv"><dt>Costo por hora</dt><dd>${usd(P.reportedBaseCost, 0)} reportado → ${usd(b.totalCost)} (−${pct(sv.pctReported)})</dd></div>
      <div class="kv"><dt>Ahorro anual (${P.peakHoursPerDay} h pico × ${P.daysPerYear} días)</dt><dd class="text-ok">${usdCompact(sv.annual)} USD</dd></div>
      <div class="kv"><dt>Espera promedio</dt><dd>${seconds(sv.base.Wq)} → ${seconds(b.Wq)} (+${seconds(sv.waitDeltaH)})</dd></div>
    </dl>
    <p class="text-sm text-slate-500">Contra el costo teórico de ${P.baseWindows} ventanillas (${usd(sv.base.totalCost)}/h), el ahorro es de ${usd(sv.perHourTheoretical)}/h.</p>
    ${takeaway(`Cerrar una ventanilla ahorra dinero y el pasajero apenas lo nota: espera ${seconds(sv.waitDeltaH)} más, muy lejos del límite de ${num(slaMin, 0)} minutos.`)}`;

  const steps = [
    { title: 'El problema', body: step1 },
    { title: 'Evaluar cada escenario', body: step2 },
    { title: 'Límite de espera', body: step3 },
    { title: 'Modelo lineal para PuLP', body: step4 },
    { title: `Por qué ${b.c}`, body: step5 },
    { title: 'Resultado', body: step6 },
  ];

  el.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-[15rem_1fr]">
      <nav class="border-b md:border-b-0 md:border-r border-line md:py-4" aria-label="Pasos">
        <ol class="flex md:flex-col overflow-x-auto [scrollbar-width:none] md:overflow-visible px-3 py-2 md:py-0 gap-1" data-steps>
          ${steps
            .map(
              (s, i) => `<li><button type="button" class="wt-step" data-go="${i}">
                <span class="wt-dot">${i + 1}</span><span class="whitespace-nowrap md:whitespace-normal">${s.title}</span></button></li>`,
            )
            .join('')}
        </ol>
      </nav>
      <div class="flex flex-col min-w-0">
        <div class="px-4 sm:px-6 py-5 space-y-4 text-sm leading-relaxed h-[60vh] md:h-[30rem] overflow-y-auto focus:outline-none" data-body tabindex="-1" autofocus></div>
        <div class="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-line">
          <button type="button" class="btn" data-prev aria-label="Anterior"><i data-lucide="arrow-left"></i><span class="hidden sm:inline">Anterior</span></button>
          <span class="text-xs text-slate-500 num whitespace-nowrap" data-count></span>
          <button type="button" class="btn btn-primary" data-next></button>
        </div>
      </div>
    </div>`;

  const body = el.querySelector('[data-body]');
  const prev = el.querySelector('[data-prev]');
  const next = el.querySelector('[data-next]');
  const stepBtns = [...el.querySelectorAll('[data-go]')];
  let current = 0;

  const go = (i) => {
    current = Math.max(0, Math.min(steps.length - 1, i));
    body.innerHTML = `<h3 class="text-base font-semibold">${current + 1}. ${steps[current].title}</h3>${steps[current].body}`;
    body.scrollTop = 0;
    stepBtns.forEach((btn, j) => {
      btn.dataset.state = j < current ? 'done' : j === current ? 'current' : 'todo';
      if (j === current) btn.setAttribute('aria-current', 'step');
      else btn.removeAttribute('aria-current');
    });
    stepBtns[current].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    prev.disabled = current === 0;
    const last = current === steps.length - 1;
    next.innerHTML = last ? 'Cerrar' : `Siguiente<i data-lucide="arrow-right"></i>`;
    el.querySelector('[data-count]').textContent = `Paso ${current + 1} de ${steps.length}`;
    refreshIcons();
  };

  stepBtns.forEach((btn) => btn.addEventListener('click', () => go(Number(btn.dataset.go))));
  prev.addEventListener('click', () => go(current - 1));
  next.addEventListener('click', () => (current === steps.length - 1 ? dialog.close() : go(current + 1)));
  dialog.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea, summary')) return;
    if (e.key === 'ArrowRight') go(current + 1);
    if (e.key === 'ArrowLeft') go(current - 1);
  });
  // Cada vez que se abre, el recorrido empieza desde el principio
  new MutationObserver(() => dialog.open && go(0)).observe(dialog, { attributes: true, attributeFilter: ['open'] });

  go(0);
}
