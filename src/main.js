import './styles.css';
import { PARAMS as P } from './config.js';
import { optimize, savings } from './lib/queue.js';
import { createStore, refreshIcons, setupDialogs, setupScrollSpy, setupMenus, setupSidebar, setupTheme } from './ui.js';
import { renderAnswers, renderIntro, renderParamsCard, renderTopSavings } from './sections/overview.js';
import { renderChart } from './sections/chart.js';
import { renderScenarios } from './sections/scenarios.js';
import { renderSensitivity } from './sections/sensitivity.js';
import { renderHourly } from './sections/hourly.js';
import { renderTwin } from './sections/twin.js';
import { renderSimulation } from './sections/simulation.js';
import { renderEnunciado } from './sections/dialogs.js';
import { renderWalkthrough } from './sections/walkthrough.js';
import { renderFooter } from './sections/footer.js';

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
import('./sections/formulation.js').then((m) => m.renderFormulation($('formulacion'), P, opt));
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
refreshIcons();

// Pantalla de carga: se retira cuando la página ya está dibujada (mínimo breve para que no parpadee).
const splash = $('splash');
if (splash) {
  const shownFor = performance.now() - (window.__splashStart ?? 0);
  const wait = Math.max(0, 700 - shownFor);
  const hide = () => {
    splash.classList.add('is-done');
    document.documentElement.classList.remove('splash-lock');
    splash.addEventListener('transitionend', () => splash.remove(), { once: true });
    setTimeout(() => splash.remove(), 800);
  };
  const ready = () => requestAnimationFrame(() => setTimeout(hide, wait));
  if (document.fonts?.ready) Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(ready);
  else ready();
}
