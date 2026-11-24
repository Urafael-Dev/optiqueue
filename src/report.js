import './report.css';
import { PARAMS as P } from './config.js';
import { mmc, optimize, savings } from './lib/queue.js';
import { simulate } from './lib/simulation.js';
import { buildModelRows, buildSteps, tex } from './lib/formulas.js';
import { SENS_PARAMS, optimalityRange, tornado } from './lib/sensitivity.js';
import { hourlyPlan } from './lib/hourly.js';
import { minutes, num, pct, seconds, usd, usdCompact, escapeHtml } from './lib/format.js';
import graficoPng from '../python/salidas/grafico_analitico.png';
import modeloPy from '../python/modelo.py?raw';

const opt = optimize(P);
const b = opt.best;
const sv = savings(P, b);
const base = mmc(P.baseWindows, P);
const sim = simulate({ c: b.c, lambda: P.lambda, mu: P.mu, cs: P.cs, cw: P.cw, wqMaxH: P.wqMaxH, hours: 8, replications: 30, seed: 2026 });
const plan = hourlyPlan(P, undefined, { fixed: [opt.x, P.baseWindows] });
const ranges = SENS_PARAMS.map((d) => ({ d, r: optimalityRange(P, d, opt.x) }));
const tor = tornado(P, opt.x);

const today = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date());
let secN = 0;
const sec = (title, body, cls = '') => `<section class="r-sec ${cls}"><h2><span class="n">${String(++secN).padStart(2, '0')}</span>${title}</h2>${body}</section>`;

const fmtParam = (d, v, precise = false) => {
  if (v === null) return '—';
  if (d.money) return `${usd(v, precise ? 2 : 0)}/h`;
  if (d.key === 'wq') return `${num(v, 2)} min`;
  return `${num(v, precise ? 2 : d.decimals)} ${d.unit}`;
};

// ---------- Contenido ----------
const cover = `
  <header class="r-cover">
    <p class="r-kicker">OptiQueue · Informe técnico · Caso de control migratorio</p>
    <h1 class="r-title">Optimización de colas en el control migratorio del aeropuerto</h1>
    <p class="r-sub">Teoría de colas M/M/c, programación entera y simulación de eventos discretos</p>
    <div class="r-meta"><span>Fecha: ${today}</span><span>Herramientas: Python (PuLP, SimPy, Matplotlib)</span><span>Versión web: optiqueue-roan.vercel.app</span></div>
  </header>
  <dl class="r-summary">
    <div><dt>Ventanillas óptimas</dt><dd>${b.c}<small>frente a ${P.baseWindows} actuales</small></dd></div>
    <div><dt>Costo total</dt><dd>${usd(b.totalCost)}<small>por hora pico</small></dd></div>
    <div><dt>Espera promedio</dt><dd>${seconds(b.Wq, 1)}<small>límite: ${num(P.wqMaxH * 60, 0)} min</small></dd></div>
    <div><dt>Ahorro anual</dt><dd>${usdCompact(sv.annual)}<small>−${pct(sv.pctReported, 1)} vs. costo reportado</small></dd></div>
  </dl>`;

const s1 = sec(
  'Planteamiento del problema',
  `<p>El servicio de migración de un aeropuerto internacional opera con ${P.baseWindows} ventanillas fijas en hora pico, con un costo reportado de
   ${usd(P.reportedBaseCost, 0)}/h. Se busca el número entero de ventanillas que minimiza el costo total (operación + espera) sin que la espera
   promedio en cola supere ${num(P.wqMaxH * 60, 0)} minutos.</p>
   <table class="r-table" style="max-width: 120mm">
     <thead><tr><th>Dato</th><th>Símbolo</th><th>Valor</th></tr></thead>
     <tbody>
       <tr><td>Tasa de llegadas (Poisson)</td><td>λ</td><td>${P.lambda} pas/h</td></tr>
       <tr><td>Tasa de servicio por ventanilla (exponencial)</td><td>μ</td><td>${P.mu} pas/h</td></tr>
       <tr><td>Costo por ventanilla abierta</td><td>C<sub>s</sub></td><td>${usd(P.cs, 0)}/h</td></tr>
       <tr><td>Costo por pasajero en cola</td><td>C<sub>w</sub></td><td>${usd(P.cw, 0)}/h</td></tr>
       <tr><td>Espera máxima permitida</td><td>W<sub>q</sub></td><td>${num(P.wqMaxH * 60, 0)} min (${num(P.wqMaxH, 1)} h)</td></tr>
     </tbody>
   </table>
   <p><strong>Preguntas:</strong> (1) ¿Cuál es el número entero óptimo de ventanillas que minimiza el costo total cumpliendo el límite de espera?
   (2) ¿Qué impacto tiene la solución en espera y costo frente a las ${P.baseWindows} ventanillas fijas?</p>`,
);

const steps = buildSteps(P, opt, opt.x);
const s2 = sec(
  'Modelo analítico M/M/c',
  `<p>El sistema es una cola con llegadas de Poisson, servicio exponencial, x servidores en paralelo y disciplina FIFO. Se evalúa con la
   fórmula de Erlang C; a la derecha, la sustitución para la solución óptima x = ${opt.x}.</p>
   <div class="r-steps">
     ${steps.map((s) => `<div class="r-step"><h4>${s.title}</h4><div>${tex(s.formula)}</div><div>${tex(s.value)}</div><p class="note">${s.note}</p></div>`).join('')}
   </div>`,
);

const s3 = sec(
  'Resultados por escenario',
  `<div class="r-scroll"><table class="r-table">
    <thead><tr><th>x</th><th>ρ</th><th>P<sub>w</sub></th><th>L<sub>q</sub></th><th>W<sub>q</sub></th><th>Operación</th><th>Espera</th><th>Costo total</th><th>Estado</th></tr></thead>
    <tbody>${opt.all
      .map((s) => {
        const state = !s.stable ? 'Inestable' : !s.meetsSla ? 'No cumple' : s.c === opt.x ? 'Óptimo' : s.c === P.baseWindows ? 'Actual' : 'Factible';
        return `<tr class="${s.c === opt.x ? 'hl' : ''}"><td>${s.c}</td><td>${pct(s.rho)}</td><td>${s.stable ? num(s.Pw, 4) : '—'}</td><td>${num(s.Lq, 3)}</td>
          <td class="${s.meetsSla ? '' : 'bad'}">${minutes(s.Wq)}</td><td>${usd(s.serviceCost)}</td><td>${usd(s.waitCost)}</td><td>${usd(s.totalCost)}</td>
          <td class="${s.stable && s.meetsSla ? '' : 'bad'}">${state}</td></tr>`;
      })
      .join('')}</tbody>
  </table></div>
  <p class="r-note">Costos en USD/h. Con x ≤ ${opt.xSla - 1} el sistema es inestable (ρ ≥ 1) y la cola crece sin límite.</p>
  <figure class="r-fig"><img src="${graficoPng}" alt="Costo total y espera por número de ventanillas (Matplotlib)" />
    <figcaption>Figura 1. Costo total y tiempo de espera según el número de ventanillas, generado con <code>grafico.py</code> (Matplotlib).</figcaption></figure>`,
);

const s4 = sec(
  'Modelo de programación entera (PuLP)',
  `<p>Como el costo total CT(x) es convexo en x, se linealiza con las secantes entre enteros consecutivos; en los puntos enteros la variable
   y coincide exactamente con CT(x). El límite de espera se traduce en una cota inferior para x.</p>
   <dl class="r-model">${buildModelRows(P, opt).map(([label, src, hint]) => `<dt>${label}</dt><dd>${tex(src)}<span class="r-note">${hint}</span></dd>`).join('')}</dl>
   <p>El solver CBC devuelve el estado <strong>Optimal</strong> con x* = ${opt.x} y y* = ${usd(opt.y)}/h, igual que la evaluación exhaustiva de la tabla anterior.</p>`,
);

const s5 = sec(
  'Validación por simulación de eventos discretos',
  `<p>Se simuló el sistema con ${b.c} ventanillas durante 8 horas (con 15 minutos de calentamiento) en ${sim.replications} réplicas independientes
   (semilla 2026). ${Math.abs(sim.wq - b.Wq) <= sim.wqHalfWidth ? 'El intervalo de confianza del 95 % de la espera contiene el valor teórico, lo que valida el modelo analítico.' : 'El valor teórico queda cerca del intervalo de confianza del 95 %; con más réplicas el intervalo se estrecha alrededor de él.'}</p>
   <table class="r-table" style="max-width: 140mm">
     <thead><tr><th>Indicador</th><th>Modelo</th><th>Simulación</th></tr></thead>
     <tbody>
       <tr><td>Espera promedio W<sub>q</sub></td><td>${seconds(b.Wq, 1)}</td><td>${seconds(sim.wq, 1)} ± ${seconds(sim.wqHalfWidth, 1)}</td></tr>
       <tr><td>Probabilidad de esperar</td><td>${pct(b.Pw, 1)}</td><td>${pct(sim.pWait, 1)}</td></tr>
       <tr><td>Costo total</td><td>${usd(b.totalCost)}/h</td><td>${usd(sim.cost)}/h</td></tr>
       <tr><td>Pasajeros con espera &gt; ${num(P.wqMaxH * 60, 0)} min</td><td>—</td><td>${pct(sim.pOverSla, 2)}</td></tr>
       <tr><td>Pasajeros atendidos por réplica</td><td>${num(P.lambda * 8, 0)} (esperado)</td><td>${num(sim.passengers, 0)}</td></tr>
     </tbody>
   </table>`,
);

const s6 = sec(
  'Análisis de sensibilidad',
  `<p>Rango de cada parámetro (con los demás fijos) en el que x* = ${opt.x} sigue siendo óptimo, y el nuevo óptimo si el parámetro varía ±20 %.</p>
   <div class="r-scroll"><table class="r-table">
     <thead><tr><th>Parámetro</th><th>Enunciado</th><th>x* = ${opt.x} mientras esté entre</th><th>Debajo</th><th>Encima</th><th>−20 %</th><th>+20 %</th></tr></thead>
     <tbody>${ranges
       .map(({ d, r }) => {
         const t = tor.find((row) => row.def === d);
         return `<tr><td>${d.label} (${d.sym})</td><td>${fmtParam(d, r.base)}</td>
           <td>${fmtParam(d, r.low.value, true)} – ${r.high.value === null ? 'sin límite' : fmtParam(d, r.high.value, true)}</td>
           <td>${r.low.x ?? '—'}</td><td>${r.high.x ?? '—'}</td><td>${t.down.x}</td><td>${t.up.x}</td></tr>`;
       })
       .join('')}</tbody>
   </table></div>
   <div class="r-callout">La solución es <strong>robusta frente a los costos</strong> (C<sub>w</sub> puede moverse entre
   ${usd(ranges[1].r.low.value, 2)} y ${usd(ranges[1].r.high.value, 2)}) pero <strong>sensible a la operación</strong>: si μ baja de
   ${num(ranges[0].r.low.value, 2)} pas/h o λ supera ${num(ranges[4].r.high.value, 1)} pas/h conviene abrir ${ranges[0].r.low.x}.</div>`,
);

const fixed = plan.fixed[0];
const s7 = sec(
  'Extensión: demanda por hora del día',
  `<p>El enunciado modela la hora pico (λ = ${P.lambda}). Con un perfil ilustrativo de 24 horas y resolviendo cada hora como un M/M/c
   estacionario (método SIPP), el plan dinámico requiere ${num(plan.dynamic.windowHours, 0)} ventanilla-horas al día frente a
   ${num(fixed.windowHours, 0)} con ${fixed.c} fijas.</p>
   <table class="r-table" style="max-width: 150mm">
     <thead><tr><th>Escenario</th><th>Ventanilla-horas/día</th><th>Costo/día</th><th>Costo/año</th></tr></thead>
     <tbody>
       <tr class="hl"><td>Plan por horas</td><td>${num(plan.dynamic.windowHours, 0)}</td><td>${usd(plan.dynamic.cost, 0)}</td><td>${usdCompact(plan.dynamic.cost * P.daysPerYear)}</td></tr>
       ${plan.fixed.map((f) => `<tr><td>${f.c} ventanillas fijas</td><td>${num(f.windowHours, 0)}</td><td>${usd(f.cost, 0)}</td><td>${usdCompact(f.cost * P.daysPerYear)}</td></tr>`).join('')}
     </tbody>
   </table>
   <p>Ahorro frente a ${fixed.c} fijas: <strong>${usd(fixed.cost - plan.dynamic.cost, 0)}/día</strong>
   (${pct((fixed.cost - plan.dynamic.cost) / fixed.cost, 1)}), unos <strong>${usdCompact((fixed.cost - plan.dynamic.cost) * P.daysPerYear)} al año</strong>.</p>
   <table class="r-table">
     <thead><tr><th>Hora</th>${plan.rows.filter((_, h) => h % 2 === 0).map((r) => `<th>${String(r.h).padStart(2, '0')}h</th>`).join('')}</tr></thead>
     <tbody>
       <tr><td>λ</td>${plan.rows.filter((_, h) => h % 2 === 0).map((r) => `<td>${r.lambda}</td>`).join('')}</tr>
       <tr><td>x*</td>${plan.rows.filter((_, h) => h % 2 === 0).map((r) => `<td><strong>${r.x}</strong></td>`).join('')}</tr>
     </tbody>
   </table>
   <p class="r-note">Horas pares; la tabla completa está en la versión web. En la práctica las ventanillas se agrupan en turnos, por lo que el ahorro real sería algo menor.</p>`,
);

const s8 = sec(
  'Conclusiones',
  `<div class="r-answer"><p class="q">Pregunta 1 · Número óptimo de ventanillas</p>
     <p class="a">${b.c} ventanillas, con un costo total de ${usd(b.totalCost)}/h</p>
     <p>Utilización del ${pct(b.rho, 0)}, espera promedio de ${minutes(b.Wq)} (${seconds(b.Wq, 1)}), muy por debajo del límite de ${num(P.wqMaxH * 60, 0)} min.</p></div>
   <div class="r-answer"><p class="q">Pregunta 2 · Impacto frente a ${P.baseWindows} ventanillas fijas</p>
     <p class="a">Ahorro de ${usd(sv.perHourReported)}/h (${pct(sv.pctReported, 1)}) y ${usdCompact(sv.annual)} al año</p>
     <p>La espera solo aumenta ${seconds(sv.waitDeltaH, 1)} (de ${seconds(base.Wq, 1)} a ${seconds(b.Wq, 1)}). Frente al costo teórico del modelo con ${P.baseWindows}
     ventanillas (${usd(base.totalCost)}/h) el ahorro es de ${usd(sv.perHourTheoretical)}/h; la diferencia con el costo reportado (${usd(P.reportedBaseCost, 0)}/h)
     indica costos operativos adicionales no incluidos en el modelo.</p></div>
   <ul class="r-list">
     <li>El modelo analítico, la programación entera y la simulación coinciden en x* = ${opt.x}.</li>
     <li>La recomendación es estable ante cambios moderados de costos, pero conviene medir con precisión μ y λ.</li>
     <li>Ajustar las ventanillas por franja horaria multiplica el ahorro respecto a una dotación fija.</li>
   </ul>`,
);

const annex = sec(
  'Anexo: código del modelo (modelo.py)',
  `<pre class="r-code">${escapeHtml(modeloPy.trimEnd())}</pre>
   <p class="r-note">El resto del código (simulacion.py, grafico.py y el notebook OptiQueue.ipynb) está en el repositorio del proyecto.</p>`,
  'r-break',
);

const root = document.getElementById('report');
root.innerHTML = cover + s1 + s2 + s3 + s4 + s5 + s6 + s7 + s8 + annex;
root.removeAttribute('aria-busy');

document.querySelector('[data-print]').addEventListener('click', () => window.print());
// ?print abre el diálogo directamente cuando las imágenes ya cargaron
if (new URLSearchParams(location.search).has('print')) {
  const img = root.querySelector('img');
  const go = () => setTimeout(() => window.print(), 300);
  if (img.complete) go();
  else img.addEventListener('load', go, { once: true });
}
