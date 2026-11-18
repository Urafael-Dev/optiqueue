import { mmc } from '../lib/queue.js';
import { simulate } from '../lib/simulation.js';
import { minutes, num, pct, seconds, usd } from '../lib/format.js';
import { sectionHead, sub } from './common.js';

export function renderSimulation(el, P, opt) {
  const options = [];
  for (let c = opt.xSla; c <= P.xMax; c++) {
    const tag = c === opt.x ? ' (óptimo)' : c === P.baseWindows ? ' (actual)' : '';
    options.push(`<option value="${c}" ${c === opt.x ? 'selected' : ''}>${c}${tag}</option>`);
  }

  el.innerHTML = `
    ${sectionHead({
      n: 7,
      id: 'h-simulacion',
      title: 'Simulación de eventos discretos',
      desc: 'Llegadas de Poisson, servicio exponencial y atención por orden de llegada. Se descartan los primeros 15 minutos, cuando la sala arranca vacía.',
    })}
    <div class="panel">
      <form class="flex flex-wrap items-end gap-4 p-5 sm:p-6 border-b border-line text-sm" data-form>
        <label class="space-y-1 w-32"><span class="label block">Ventanillas</span><select name="c" class="field">${options.join('')}</select></label>
        <label class="space-y-1 w-32"><span class="label block">Duración</span>
          <select name="hours" class="field"><option value="1">1 hora</option><option value="4" selected>4 horas</option><option value="8">8 horas</option><option value="24">24 horas</option></select>
        </label>
        <label class="space-y-1 w-24"><span class="label block">Réplicas</span>
          <select name="replications" class="field"><option>5</option><option>10</option><option selected>30</option></select>
        </label>
        <label class="space-y-1 w-24"><span class="label block">Semilla</span><input name="seed" type="number" min="1" step="1" value="2026" class="field" required /></label>
        <button type="submit" class="btn btn-primary"><i data-lucide="play"></i>Simular</button>
      </form>
      <div class="p-5 sm:p-6" data-results aria-live="polite">
        <p class="text-sm text-slate-500">Ejecuta la simulación para comparar sus resultados con el modelo analítico.</p>
      </div>
    </div>`;

  const form = el.querySelector('[data-form]');
  const results = el.querySelector('[data-results]');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const c = Number(fd.get('c'));
    const hours = Number(fd.get('hours'));
    const replications = Number(fd.get('replications'));
    const seed = Math.max(1, Math.floor(Number(fd.get('seed')) || 1));

    const r = simulate({ ...P, c, hours, replications, seed });
    const theo = mmc(c, P);
    const covers = Math.abs(r.wq - theo.Wq) <= r.wqHalfWidth;

    const row = (k, sim, th) => `<tr><td class="!text-left text-slate-600">${k}</td><td class="text-ink font-medium">${sim}</td><td class="text-slate-500">${th}</td></tr>`;

    results.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div class="lg:col-span-3 space-y-3">
          <table class="table text-sm -mx-3 w-[calc(100%+1.5rem)]">
            <thead><tr><th scope="col">Indicador</th><th scope="col">Simulación</th><th scope="col">Modelo</th></tr></thead>
            <tbody>
              ${row(`Espera promedio (${sub('W', 'q')})`, `${minutes(r.wq)} <span class="text-slate-400 font-normal">± ${minutes(r.wqHalfWidth)}</span>`, minutes(theo.Wq))}
              ${row('Pasajeros que esperan', pct(r.pWait), pct(theo.Pw))}
              ${row('Costo total', `${usd(r.cost)}/h`, `${usd(theo.totalCost)}/h`)}
              ${row('Esperan más de 6 min', pct(r.pOverSla, 2), '—')}
              ${row('Espera máxima observada', minutes(r.maxWait, 1), '—')}
            </tbody>
          </table>
          <p class="text-sm ${covers ? 'text-ok' : 'text-slate-600'}">
            ${
              covers
                ? 'El intervalo de confianza del 95 % contiene el valor teórico: la simulación respalda el modelo.'
                : 'El intervalo no contiene el valor teórico. En corridas cortas la espera varía mucho; prueba más horas o réplicas.'
            }
          </p>
          <p class="text-xs text-slate-500">${r.replications} réplicas de ${hours} h · ${num(r.passengers, 0)} pasajeros por réplica en promedio.</p>
        </div>
        <div class="lg:col-span-2">
          <p class="label mb-2">Primeros pasajeros de la réplica 1</p>
          <div class="max-h-64 overflow-y-auto">
            <table class="table w-full text-xs">
              <thead class="sticky top-0 bg-surface"><tr><th scope="col">Llegada</th><th scope="col">Ventanilla</th><th scope="col">Espera</th></tr></thead>
              <tbody>
                ${r.log
                  .map(
                    (ev) => `<tr><td class="!text-left">${num(ev.arrival * 60, 2)} min</td><td>${ev.window}</td>
                      <td class="${ev.wait > 0 ? 'text-ink' : 'text-slate-400'}">${ev.wait > 0 ? seconds(ev.wait) : '—'}</td></tr>`,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  });
}
