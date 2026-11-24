import './styles.css';
import { PARAMS as P } from './config.js';
import { optimize, savings } from './lib/queue.js';
import { createStore, playNavIntro, refreshIcons, setupDialogs, setupScrollSpy, setupMenus, setupSidebar, setupTheme } from './ui.js';
import { renderAnswers, renderIntro, renderParamsCard, renderTopSavings } from './sections/overview.js';
import { renderChart } from './sections/chart.js';
import { renderScenarios } from './sections/scenarios.js';
import { renderSensitivity } from './sections/sensitivity.js';
import { renderHourly } from './sections/hourly.js';
import { renderTwin } from './sections/twin.js';
import { assistantAvailable, renderAssistant } from './sections/assistant.js';
import { renderSimulation } from './sections/simulation.js';
import { renderEnunciado } from './sections/dialogs.js';
import { renderWalkthrough } from './sections/walkthrough.js';
import { renderFooter } from './sections/footer.js';
import { renderComparator } from './sections/comparator.js';
import { provide, use } from './lib/bridge.js';
import { escapeHtml, num, usd } from './lib/format.js';

const $ = (id) => document.getElementById(id);

const opt = optimize(P);
if (opt.status !== 'Optimal') throw new Error('El modelo no tiene solución factible con los parámetros actuales.');
const sv = savings(P, opt.best);
const store = createStore({ x: opt.x });

renderParamsCard($('paramsCard'), P, opt);
renderTopSavings($('topSavings'), sv);
renderIntro($('inicio'), P, opt, sv);
renderAnswers($('respuestas'), P, opt, sv);
renderChart($('grafico'), P, opt);
renderScenarios($('escenarios'), P, opt, store);
renderSensitivity($('sensibilidad'), P, opt);
renderHourly($('demanda'), P, opt);
renderTwin($('gemelo'), P, opt, store);
renderSimulation($('simulacion'), P, opt);
// KaTeX es pesado: la sección de fórmulas se carga en un fragmento aparte sin retrasar el resto.
$('formulacion').innerHTML = '<div class="panel h-[60rem] animate-pulse" aria-busy="true"></div>';
const formulationMod = import('./sections/formulation.js');
formulationMod.then((m) => m.renderFormulation($('formulacion'), P, opt));
// highlight.js solo se descarga al acercarse a la sección de código (o al pedir un archivo).
let codeApi;
const loadCode = () =>
  (codeApi ??= import('./sections/code.js').then((m) => m.renderCode($('codigo'))));
$('codigo').innerHTML = '<div class="panel h-[46rem] animate-pulse" aria-busy="true"></div>';
const codeIO = new IntersectionObserver(
  ([e]) => {
    if (!e.isIntersecting) return;
    codeIO.disconnect();
    loadCode();
  },
  { rootMargin: '800px 0px' },
);
codeIO.observe($('codigo'));
renderEnunciado($('enunciadoBody'), P, opt, sv);
renderWalkthrough($('optBody'), $('dlgOpt'), P, opt, sv);
renderFooter($('pie'), opt);
renderComparator($('comparador'), P);

// ---------- Modo exploración: el asistente (o el comparador) recalcula la app con otros datos ----------
let explore = null; // { P, opt, label } mientras se exploran otros datos; null = enunciado

/** Parámetros + rango de 9 escenarios alrededor del nuevo óptimo (o null si no hay solución). */
function viewFor(params) {
  const wide = optimize({ ...params, xMin: 1, xMax: 80 });
  if (wide.status !== 'Optimal') return null;
  const xMin = Math.max(Math.floor(params.lambda / params.mu) + 1, wide.x - 3);
  const P2 = { ...params, xMin, xMax: xMin + 8 };
  const opt2 = optimize(P2);
  return { P: P2, opt: opt2, sv: savings(P2, opt2.best) };
}

function renderAll(view) {
  const { P: p, opt: o, sv: s } = view;
  renderParamsCard($('paramsCard'), p, o, !!explore);
  renderTopSavings($('topSavings'), s);
  renderIntro($('inicio'), p, o, s);
  renderAnswers($('respuestas'), p, o, s);
  renderChart($('grafico'), p, o);
  renderScenarios($('escenarios'), p, o, store);
  renderSensitivity($('sensibilidad'), p, o);
  renderHourly($('demanda'), p, o);
  renderSimulation($('simulacion'), p, o);
  formulationMod.then((m) => m.renderFormulation($('formulacion'), p, o));
  renderWalkthrough($('optBody'), $('dlgOpt'), p, o, s);
  renderFooter($('pie'), o);
  use('gemelo')?.setParams(p, o);
  store.set({ x: Math.min(p.xMax, Math.max(p.xMin, o.x)) });
  refreshIcons();
}

function drawBanner() {
  const el = $('whatIf');
  if (!explore) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  const p = explore.P;
  const diff = (k, label, v, fmt) => `<span class="whatif-pill ${p[k] !== P[k] ? 'is-changed' : ''}">${label} ${fmt(v)}</span>`;
  el.hidden = false;
  el.innerHTML = `
    <span class="whatif-ico"><i data-lucide="flask-conical"></i></span>
    <div class="min-w-0 flex-1">
      <p class="whatif-title">Modo exploración${explore.label ? ` · ${escapeHtml(explore.label)}` : ''}</p>
      <p class="whatif-pills">
        ${diff('lambda', 'λ', p.lambda, (v) => `${num(v, 0)} pas/h`)}${diff('mu', 'μ', p.mu, (v) => `${num(v, 1)} pas/h`)}
        ${diff('cs', 'Cs', p.cs, (v) => `${usd(v, 0)}/h`)}${diff('cw', 'Cw', p.cw, (v) => `${usd(v, 0)}/h`)}${diff('wqMaxH', 'Wq ≤', p.wqMaxH * 60, (v) => `${num(v, 1)} min`)}
        <span class="whatif-result">→ ${explore.opt.x} ventanillas · ${usd(explore.opt.y)}/h</span>
      </p>
    </div>
    <button type="button" class="btn whatif-restore" data-restore><i data-lucide="undo-2"></i>Volver al escenario base</button>`;
  refreshIcons();
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-restore]')) appApi.restore();
});

const appApi = {
  /** Recalcula toda la app con otros datos (los omitidos quedan como en el enunciado). */
  apply({ lambda, mu, cs, cw, wqMin } = {}, label = '') {
    const params = { ...P, lambda: lambda ?? P.lambda, mu: mu ?? P.mu, cs: cs ?? P.cs, cw: cw ?? P.cw, wqMaxH: wqMin != null ? wqMin / 60 : P.wqMaxH };
    const view = viewFor(params);
    if (!view) return { ok: false, error: 'Con estos datos ningún número de ventanillas (1 a 80) cumple el límite de espera.' };
    explore = { P: view.P, opt: view.opt, label };
    renderAll(view);
    drawBanner();
    document.getElementById('inicio').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return { ok: true, ventanillas_optimas: view.opt.x, costo_total_usd_h: Number(view.opt.y.toFixed(2)), Wq_segundos: Number((view.opt.best.Wq * 3600).toFixed(2)), escenarios_mostrados: [view.P.xMin, view.P.xMax] };
  },
  restore() {
    if (!explore) return { ok: true, ya_estaba: true };
    explore = null;
    renderAll({ P, opt, sv });
    drawBanner();
    return { ok: true };
  },
  state() {
    const p = explore?.P ?? P;
    return {
      pagina: 'principal',
      modo: explore ? 'exploración' : 'enunciado',
      parametros: { lambda: p.lambda, mu: p.mu, costo_ventanilla: p.cs, costo_espera: p.cw, espera_max_min: p.wqMaxH * 60 },
      ventanillas_optimas: (explore?.opt ?? opt).x,
      ventanillas_seleccionadas: store.get().x,
      comparador: use('comparador')?.list().map((r) => ({ nombre: r.nombre, ventanillas: r.sol.m?.c ?? null, costo_total_usd_h: r.sol.m?.stable ? Number(r.sol.m.totalCost.toFixed(2)) : null })) ?? [],
    };
  },
};
provide('app', appApi);

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="open-opt"]')) $('dlgOpt').showModal();
  const goto = e.target.closest('[data-goto-code]');
  if (goto) loadCode().then((api) => api.showFile(goto.dataset.gotoCode));
});

setupDialogs();
setupSidebar();
setupTheme();
setupMenus();
setupScrollSpy();
// El asistente solo aparece si el administrador lo tiene encendido (ASISTENTE_IA)
assistantAvailable().then((ok) => ok && renderAssistant());
refreshIcons();

// Pantalla de carga: se retira cuando la página ya está dibujada (mínimo breve para que no parpadee).
const splash = $('splash');
if (splash) {
  const shownFor = performance.now() - (window.__splashStart ?? 0);
  const wait = Math.max(0, 700 - shownFor);
  const hide = () => {
    splash.classList.add('is-done');
    document.documentElement.classList.remove('splash-lock');
    playNavIntro(); // la barra lateral entra justo cuando se retira la pantalla de carga
    splash.addEventListener('transitionend', () => splash.remove(), { once: true });
    setTimeout(() => splash.remove(), 800);
  };
  const ready = () => requestAnimationFrame(() => setTimeout(hide, wait));
  if (document.fonts?.ready) Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(ready);
  else ready();
} else playNavIntro();
