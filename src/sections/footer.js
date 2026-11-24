import modeloUrl from '../../python/modelo.py?url';
import simulacionUrl from '../../python/simulacion.py?url';
import graficoUrl from '../../python/grafico.py?url';
import requirementsUrl from '../../python/requirements.txt?url';
import notebookUrl from '../../python/OptiQueue.ipynb?url';
import csvUrl from '../../python/salidas/resultados_mmc.csv?url';

const SECTIONS = [
  ['#respuestas', 'Recomendación'],
  ['#grafico', 'Costo vs. espera'],
  ['#escenarios', 'Escenarios'],
  ['#sensibilidad', 'Sensibilidad'],
  ['#demanda', 'Demanda por hora'],
  ['#gemelo', 'Gemelo digital'],
  ['#simulacion', 'Simulación'],
  ['#formulacion', 'Modelo matemático'],
  ['#codigo', 'Código Python'],
];

const FILES = [
  [modeloUrl, 'modelo.py', 'Modelo y PuLP'],
  [simulacionUrl, 'simulacion.py', 'SimPy'],
  [graficoUrl, 'grafico.py', 'Matplotlib'],
  [requirementsUrl, 'requirements.txt', 'Dependencias'],
  [notebookUrl, 'OptiQueue.ipynb', 'Jupyter'],
  [csvUrl, 'resultados_mmc.csv', 'Datos'],
];

const METHODS = [
  ['Teoría de colas', 'Modelo M/M/c con la fórmula de Erlang C'],
  ['Simulación', 'Eventos discretos con réplicas e intervalos de confianza'],
  ['Optimización', 'Programación entera con cortes lineales (PuLP + CBC)'],
];

export function renderFooter(el, opt) {
  const col = (title, body) => `
    <div>
      <h2 class="text-xs font-medium uppercase tracking-wider text-slate-500">${title}</h2>
      <div class="mt-3">${body}</div>
    </div>`;

  el.innerHTML = `
    <div class="max-w-6xl mx-auto px-4 sm:px-8 py-10 grid grid-cols-2 lg:grid-cols-12 gap-x-8 gap-y-10">
      <div class="col-span-2 lg:col-span-4 space-y-4">
        <a href="#inicio" class="inline-flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" width="28" height="28" class="rounded-md" />
          <span class="font-semibold text-ink">Opti<span class="text-accent">Queue</span></span>
        </a>
        <p class="text-sm text-slate-500 max-w-sm">
          Software de optimización de colas: decide cuántos puntos de atención abrir para minimizar costos sin superar el
          tiempo de espera objetivo. Este panel muestra el caso de control migratorio de un aeropuerto.
        </p>
        <p class="inline-flex items-center gap-2 rounded-md border border-line bg-slate-50 px-3 py-1.5 text-sm">
          <span class="text-slate-500">Resultado:</span>
          <span class="font-medium text-ink tabular-nums">x* = ${opt.x} ventanillas</span>
        </p>
      </div>

      <div class="lg:col-span-2">
        ${col(
          'Panel',
          `<ul class="space-y-2 text-sm">
            ${SECTIONS.map(([href, label]) => `<li><a href="${href}" class="text-slate-600 hover:text-ink">${label}</a></li>`).join('')}
          </ul>`,
        )}
      </div>

      <div class="lg:col-span-3">
        ${col(
          'Recursos',
          `<ul class="space-y-2 text-sm">
            <li><button type="button" class="text-left text-slate-600 hover:text-ink cursor-pointer" data-open="dlgEnunciado">Planteamiento del caso</button></li>
            <li><button type="button" class="text-left text-slate-600 hover:text-ink cursor-pointer" data-action="open-opt">Resolución paso a paso</button></li>
            <li><a href="./descargas/OptiQueue_Informe_Final.docx" download class="text-slate-600 hover:text-ink">Informe técnico (Word)</a></li>
            <li><a href="./descargas/OptiQueue_Informe_Final.pdf" download class="text-slate-600 hover:text-ink">Informe técnico (PDF)</a></li>
            <li><a href="./informe.html" class="text-slate-600 hover:text-ink">Resumen imprimible</a></li>
            <li><a href="/resolver.html" class="text-slate-600 hover:text-ink">Resolvedor de colas</a></li>
          </ul>
          <p class="mt-5 text-xs text-slate-500">Descargar código</p>
          <ul class="mt-2 space-y-1.5 text-sm">
            ${FILES.map(
              ([url, name, hint]) => `
              <li><a href="${url}" download="${name}" class="group inline-flex items-center gap-2 text-slate-600 hover:text-ink">
                <i data-lucide="download" class="w-3.5 h-3.5 text-slate-400 group-hover:text-accent"></i>
                <span class="font-mono text-[13px] break-all">${name}</span><span class="hidden sm:inline text-xs text-slate-400">${hint}</span>
              </a></li>`,
            ).join('')}
          </ul>`,
        )}
      </div>

      <div class="col-span-2 lg:col-span-3">
        ${col(
          'Método',
          `<dl class="space-y-3 text-sm">
            ${METHODS.map(([k, v]) => `<div><dt class="font-medium text-ink">${k}</dt><dd class="text-slate-500">${v}</dd></div>`).join('')}
          </dl>`,
        )}
      </div>
    </div>

    <div class="border-t border-line">
      <div class="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
        <p>© ${new Date().getFullYear()} OptiQueue. Todas las cifras se calculan en el navegador a partir de los datos del caso.</p>
        <button type="button" class="inline-flex items-center gap-1.5 self-start sm:self-auto text-slate-600 hover:text-ink cursor-pointer" data-top>
          Volver arriba<i data-lucide="arrow-up" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>`;

  el.querySelector('[data-top]').addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
}
