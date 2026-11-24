import { num, seconds, usd } from '../lib/format.js';
import { sub } from './common.js';

/** Planteamiento del caso: situación, datos, preguntas de negocio y alcance del análisis. */
export function renderEnunciado(el, P, opt, sv) {
  const b = opt.best;
  const slaMin = num(P.wqMaxH * 60, 0);

  const block = (title, body) => `
    <section class="space-y-3">
      <h3 class="text-xs font-medium uppercase tracking-wider text-slate-500">${title}</h3>
      ${body}
    </section>`;

  // Diagrama del sistema: llegadas → cola → ventanillas → salida
  const node = (title, value, hint) => `
    <div class="flex-1 min-w-0 rounded-lg border border-line bg-surface px-3 py-2.5 text-center">
      <p class="text-xs text-slate-500">${title}</p>
      <p class="font-semibold text-ink num">${value}</p>
      <p class="text-[11px] text-slate-500">${hint}</p>
    </div>`;
  const arrow = '<span class="hidden sm:flex items-center text-slate-300" aria-hidden="true">→</span>';
  const diagram = `
    <div class="grid grid-cols-2 sm:flex sm:flex-row items-stretch gap-2 rounded-lg bg-slate-50 border border-line p-3"
         role="img" aria-label="Los pasajeros llegan a ${P.lambda} por hora, esperan en una única cola y pasan a la primera de x ventanillas libres, cada una atiende ${P.mu} por hora.">
      ${node('Llegan', `λ = ${P.lambda}/h`, 'llegadas aleatorias')}
      ${arrow}
      ${node('Esperan', 'una sola cola', 'orden de llegada')}
      ${arrow}
      ${node('Se atienden', `x ventanillas`, `μ = ${P.mu}/h cada una`)}
      ${arrow}
      ${node('Salen', 'control listo', `≈ ${num(60 / P.mu, 0)} min por pasajero`)}
    </div>`;

  const data = [
    ['λ', `${P.lambda} pasajeros/h`, 'Llegadas en hora pico'],
    ['μ', `${P.mu} pasajeros/h`, 'Capacidad de una ventanilla'],
    [sub('C', 's'), `${usd(P.cs, 0)}/h`, 'Costo de tener una ventanilla abierta'],
    [sub('C', 'w'), `${usd(P.cw, 0)}/h`, 'Costo por cada pasajero esperando en cola'],
    [`${sub('W', 'q')} ≤`, `${slaMin} min (${num(P.wqMaxH, 1)} h)`, 'Espera promedio máxima permitida'],
    ['Hoy', `${P.baseWindows} ventanillas`, `Costo reportado: ${usd(P.reportedBaseCost, 0)}/h`],
  ];

  const questions = [
    {
      q: `¿Cuál es el número entero óptimo de ventanillas que minimiza el costo total cumpliendo la restricción de ${slaMin} minutos de espera?`,
      a: `${b.c} ventanillas · ${usd(b.totalCost)}/h`,
    },
    {
      q: `¿Qué impacto cuantitativo en tiempo de espera y costo por hora genera la solución frente a las ${P.baseWindows} ventanillas fijas?`,
      a: `${usd(sv.perHourReported)}/h menos · espera +${seconds(sv.waitDeltaH)}`,
    },
  ];

  const deliverables = [
    ['Validación con simulación de eventos discretos', '#simulacion', 'Simulación'],
    ['Optimización entera del número de ventanillas', '#codigo', 'Código'],
    [`Modelo de decisión con <span class="font-mono text-ink">x</span> (ventanillas, entero) e <span class="font-mono text-ink">y</span> (costo resultante)`, '#formulacion', 'Modelo'],
    ['Curva de tiempo de espera frente a costo total', '#grafico', 'Gráfico'],
  ];

  el.innerHTML = `
    <div class="px-4 sm:px-6 py-5 space-y-7 text-sm leading-relaxed max-h-[65vh] overflow-y-auto" data-scroll>
      ${block(
        'Situación',
        `<p>En la zona de migración de un aeropuerto internacional se forman colas en hora pico. Hoy el cliente abre
        <strong class="text-ink">${P.baseWindows} ventanillas fijas</strong> durante todo el turno y necesita saber cuántas abrir para
        <strong class="text-ink">reducir el costo operativo</strong> sin que la espera promedio supere <strong class="text-ink">${slaMin} minutos</strong>.</p>
        ${diagram}`,
      )}

      ${block(
        'Datos',
        `<dl class="grid grid-cols-1 sm:grid-cols-2 gap-px rounded-lg overflow-hidden border border-line bg-line">
          ${data
            .map(
              ([sym, val, desc]) => `
            <div class="bg-surface px-4 py-3 flex items-baseline gap-3">
              <dt class="w-10 shrink-0 font-mono text-accent whitespace-nowrap">${sym}</dt>
              <dd class="min-w-0"><span class="font-medium text-ink num">${val}</span><span class="block text-xs text-slate-500">${desc}</span></dd>
            </div>`,
            )
            .join('')}
        </dl>`,
      )}

      ${block(
        'Preguntas de negocio',
        `<ol class="space-y-3">
          ${questions
            .map(
              (it, i) => `
            <li class="rounded-lg border border-line p-4">
              <div class="flex gap-3">
                <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium text-white">${i + 1}</span>
                <div class="min-w-0 space-y-2">
                  <p class="text-ink">${it.q}</p>
                  <p class="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span class="text-slate-500">Resultado: <span class="font-medium text-ink num">${it.a}</span></span>
                    <a href="#respuestas" class="link" data-close>Ver detalle<i data-lucide="arrow-right"></i></a>
                  </p>
                </div>
              </div>
            </li>`,
            )
            .join('')}
        </ol>`,
      )}

      ${block(
        'Alcance del análisis',
        `<ul class="divide-y divide-line rounded-lg border border-line">
          ${deliverables
            .map(
              ([text, href, label]) => `
            <li class="flex items-center gap-3 px-4 py-2.5">
              <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok/10 text-ok" aria-hidden="true"><i data-lucide="check" class="w-3 h-3"></i></span>
              <span class="flex-1 min-w-0">${text}</span>
              <a href="${href}" class="link shrink-0" data-close>${label}<i data-lucide="arrow-right"></i></a>
            </li>`,
            )
            .join('')}
        </ul>
        <p class="text-xs text-slate-500">Cada punto del análisis tiene su sección en el panel; el enlace lleva directamente a ella.</p>`,
      )}
    </div>
    <div class="flex items-center justify-end gap-2 px-4 sm:px-6 py-3 border-t border-line">
      <button type="button" class="btn" data-action="open-opt" data-close><span class="sm:hidden">Paso a paso</span><span class="hidden sm:inline">Ver resolución paso a paso</span></button>
      <button type="button" class="btn btn-primary" data-close>Entendido</button>
    </div>`;

  // Al reabrir, el enunciado empieza siempre desde arriba
  const dialog = el.closest('dialog');
  new MutationObserver(() => {
    if (dialog.open) el.querySelector('[data-scroll]').scrollTop = 0;
  }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
}
