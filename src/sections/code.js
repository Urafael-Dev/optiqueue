import hljs from 'highlight.js/lib/core';
import python from 'highlight.js/lib/languages/python';
import modeloPy from '../../python/modelo.py?raw';
import simulacionPy from '../../python/simulacion.py?raw';
import graficoPy from '../../python/grafico.py?raw';
import requirements from '../../python/requirements.txt?raw';
import salidaModelo from '../../python/salidas/modelo.txt?raw';
import salidaSimulacion from '../../python/salidas/simulacion.txt?raw';
import salidaGrafico from '../../python/salidas/grafico.txt?raw';
import graficoPng from '../../python/salidas/grafico_analitico.png';
import notebookUrl from '../../python/OptiQueue.ipynb?url';
import { escapeHtml } from '../lib/format.js';

const COLAB_URL = 'https://colab.research.google.com/github/Urafael-Dev/optiqueue/blob/main/python/OptiQueue.ipynb';
import { copyWithFeedback, refreshIcons } from '../ui.js';
import { sectionHead } from './common.js';

hljs.registerLanguage('python', python);

const FILES = [
  {
    name: 'modelo.py',
    role: 'Modelo M/M/c y optimización con PuLP',
    code: modeloPy,
    output: salidaModelo,
  },
  {
    name: 'simulacion.py',
    role: 'Simulación de eventos discretos con SimPy',
    code: simulacionPy,
    output: salidaSimulacion,
  },
  {
    name: 'grafico.py',
    role: 'Gráfico de espera frente a costo con Matplotlib',
    code: graficoPy,
    output: salidaGrafico,
    image: graficoPng,
  },
  {
    name: 'requirements.txt',
    role: 'Dependencias',
    code: requirements,
    plain: true,
  },
];

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function highlighted(file) {
  const src = file.code.replace(/\n$/, '');
  return file.plain ? escapeHtml(src) : hljs.highlight(src, { language: 'python' }).value;
}

export function renderCode(el) {
  el.innerHTML = `
    ${sectionHead({
      n: 9,
      id: 'h-codigo',
      title: 'Implementación en Python',
      desc: 'Código ejecutable del proyecto. La salida mostrada debajo de cada archivo es la de una ejecución real.',
    })}

    <div class="panel overflow-hidden">
      <div class="on-navy flex items-stretch bg-navy text-sm">
        <div class="flex flex-1 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="Archivos">
          ${FILES.map(
            (f, i) => `<button type="button" role="tab" id="file-tab-${i}" aria-controls="file-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"
              class="editor-tab">${f.name}</button>`,
          ).join('')}
        </div>
        <div class="hidden sm:flex items-center gap-1 px-2">
          <button type="button" class="editor-action" data-copy><i data-lucide="copy"></i><span data-label>Copiar</span></button>
          <button type="button" class="editor-action" data-download><i data-lucide="download"></i>Descargar</button>
        </div>
      </div>

      <div id="file-panel" role="tabpanel" aria-labelledby="file-tab-0">
        <div class="on-navy flex items-center justify-between gap-4 px-4 py-2 bg-[#14233a] text-xs text-slate-400 border-t border-white/5">
          <span data-role></span>
          <span data-lines class="font-mono shrink-0"></span>
        </div>
        <div class="code-view">
          <pre class="code-gutter" aria-hidden="true" data-gutter></pre>
          <pre class="code-body"><code class="hljs" data-code></code></pre>
        </div>
        <div class="on-navy flex sm:hidden gap-2 px-4 py-3 bg-navy border-t border-white/5">
          <button type="button" class="editor-action" data-copy><i data-lucide="copy"></i><span data-label>Copiar</span></button>
          <button type="button" class="editor-action" data-download><i data-lucide="download"></i>Descargar</button>
        </div>
        <div data-output></div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
      <div class="md:col-span-1">
        <h3 class="font-medium">Cómo ejecutarlo</h3>
        <p class="mt-1 text-slate-500">Requiere Python 3.10 o superior. Los tres archivos deben estar en la misma carpeta.</p>
      </div>
      <pre class="md:col-span-2 rounded-lg bg-surface border border-line px-4 py-3 font-mono text-[13px] text-ink overflow-x-auto"><span class="text-slate-400">$</span> pip install -r requirements.txt
<span class="text-slate-400">$</span> python modelo.py        <span class="text-slate-400"># tabla de escenarios y óptimo con PuLP</span>
<span class="text-slate-400">$</span> python simulacion.py    <span class="text-slate-400"># validación con SimPy</span>
<span class="text-slate-400">$</span> python grafico.py       <span class="text-slate-400"># genera grafico_analitico.png</span></pre>
    </div>

    <div class="panel px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
      <div class="flex items-start gap-3 flex-1 min-w-0">
        <span class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><i data-lucide="book-open" class="w-[18px] h-[18px]"></i></span>
        <div>
          <h3 class="text-sm font-medium">Notebook de Jupyter</h3>
          <p class="text-sm text-slate-500"><span class="font-mono text-[13px] text-ink">OptiQueue.ipynb</span> reúne todo el desarrollo (modelo, PuLP, gráfico, SimPy, sensibilidad y demanda por hora) con las salidas ya ejecutadas.</p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 sm:shrink-0">
        <a class="btn" href="${notebookUrl}" download="OptiQueue.ipynb"><i data-lucide="download"></i>Descargar .ipynb</a>
        <a class="btn btn-primary" href="${COLAB_URL}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>Abrir en Colab</a>
      </div>
    </div>`;

  const tabs = [...el.querySelectorAll('[role="tab"]')];
  const panel = el.querySelector('#file-panel');
  const $ = (sel) => panel.querySelector(sel);
  let current = FILES[0];

  const show = (i, focus = false) => {
    current = FILES[i];
    tabs.forEach((t, j) => {
      t.setAttribute('aria-selected', String(j === i));
      t.tabIndex = j === i ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', tabs[i].id);
    if (focus) tabs[i].focus();

    const lines = current.code.replace(/\n$/, '').split('\n').length;
    $('[data-role]').textContent = current.role;
    $('[data-lines]').textContent = `${lines} líneas · ${current.plain ? 'texto' : 'Python'}`;
    $('[data-gutter]').textContent = Array.from({ length: lines }, (_, k) => k + 1).join('\n');
    $('[data-code]').innerHTML = highlighted(current);

    $('[data-output]').innerHTML = current.output
      ? `<div class="border-t border-line bg-surface">
          <p class="px-4 pt-3 text-xs text-slate-500">Salida de <span class="font-mono text-ink">python ${current.name}</span></p>
          <pre class="px-4 py-3 font-mono text-[13px] leading-relaxed text-ink overflow-x-auto">${escapeHtml(current.output.trimEnd())}</pre>
          ${
            current.image
              ? `<figure class="px-4 pb-4"><img src="${current.image}" alt="Gráfico generado por grafico.py: costo total mínimo en 15 ventanillas y espera bajo el límite de 6 minutos" loading="lazy" class="w-full max-w-3xl rounded-lg border border-line" /></figure>`
              : ''
          }
        </div>`
      : '';
    el.querySelector('.code-view').scrollTop = 0;
  };

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(i));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) show((i + d + tabs.length) % tabs.length, true);
    });
  });
  el.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copyWithFeedback(b, current.code)));
  el.querySelectorAll('[data-download]').forEach((b) => b.addEventListener('click', () => download(current.name, current.code)));

  show(0);
  refreshIcons();

  // Permite abrir un archivo concreto desde otras secciones (p. ej. «Ver el código» del gráfico Matplotlib)
  return {
    showFile(name) {
      const i = FILES.findIndex((f) => f.name === name);
      if (i >= 0) show(i);
    },
  };
}
