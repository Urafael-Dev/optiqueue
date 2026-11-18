import { minutes, num, pct, usd } from '../lib/format.js';
import { sectionHead } from './common.js';

function verdict(s, P, opt) {
  if (!s.stable) return ['Inestable', 'text-bad'];
  if (!s.meetsSla) return ['No cumple', 'text-bad'];
  if (s.c === opt.x) return ['Óptimo', 'text-accent font-medium'];
  if (s.c === P.baseWindows) return ['Actual', 'text-ink'];
  return ['Factible', 'text-slate-500'];
}

export function renderScenarios(el, P, opt, store) {
  let showAll = false;
  const isMain = (s) => Math.abs(s.c - opt.x) <= 2 || s.c === P.baseWindows;

  el.innerHTML = `
    ${sectionHead({
      n: 3,
      id: 'h-escenarios',
      title: 'Escenarios',
      desc: 'Indicadores del modelo para cada número de ventanillas. Selecciona una fila para verla en el gemelo digital.',
      actions: `<button type="button" class="link" data-toggle aria-expanded="false"></button>`,
    })}
    <div class="panel overflow-x-auto">
      <table class="table w-full min-w-[760px] text-sm whitespace-nowrap">
        <caption class="sr-only">Indicadores y costos por número de ventanillas</caption>
        <thead>
          <tr>
            <th scope="col">Ventanillas</th>
            <th scope="col">ρ</th>
            <th scope="col">P<sub>w</sub></th>
            <th scope="col">L<sub>q</sub></th>
            <th scope="col">W<sub>q</sub></th>
            <th scope="col">Costo operación</th>
            <th scope="col">Costo espera</th>
            <th scope="col">Costo total</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
    <p class="text-xs text-slate-500">
      Costos en USD/h. El sistema es estable con ${opt.xSla} o más ventanillas (ρ &lt; 1). P<sub>0</sub> ≈ 5·10<sup>−6</sup> en todos los casos estables, por eso no se muestra.
    </p>`;

  const tbody = el.querySelector('tbody');
  const toggle = el.querySelector('[data-toggle]');

  const draw = () => {
    const current = store.get().x;
    toggle.textContent = showAll ? 'Mostrar solo los principales' : `Mostrar todos (${P.xMin} a ${P.xMax})`;
    tbody.innerHTML = opt.all
      .filter((s) => showAll || isMain(s))
      .map((s) => {
        const [label, cls] = verdict(s, P, opt);
        const isOpt = s.c === opt.x;
        return `
        <tr data-c="${s.c}" class="cursor-pointer hover:bg-slate-50 ${isOpt ? 'bg-accent-soft/60 hover:bg-accent-soft' : ''}">
          <td class="!text-left">
            <button type="button" class="${s.c === current ? 'font-semibold text-ink' : 'text-slate-700'} hover:underline underline-offset-4 cursor-pointer"
              aria-label="Ver ${s.c} ventanillas en el gemelo digital">${s.c}${s.c === current ? '<span class="ml-2 text-xs font-normal text-slate-400">en gemelo</span>' : ''}</button>
          </td>
          <td class="${s.stable ? '' : 'text-bad'}">${pct(s.rho)}</td>
          <td>${s.stable ? num(s.Pw, 4) : '—'}</td>
          <td>${num(s.Lq, 3)}</td>
          <td class="${s.meetsSla ? '' : 'text-bad'}">${minutes(s.Wq)}</td>
          <td class="text-slate-500">${usd(s.serviceCost)}</td>
          <td class="text-slate-500">${usd(s.waitCost)}</td>
          <td class="font-medium ${isOpt ? 'text-accent' : 'text-ink'}">${usd(s.totalCost)}</td>
          <td class="${cls}">${label}</td>
        </tr>`;
      })
      .join('');
  };

  tbody.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-c]');
    if (!row) return;
    store.set({ x: Number(row.dataset.c) });
    document.getElementById('gemelo').scrollIntoView({ block: 'start' });
  });
  toggle.addEventListener('click', () => {
    showAll = !showAll;
    toggle.setAttribute('aria-expanded', String(showAll));
    draw();
  });

  store.subscribe(draw);
  draw();
}
