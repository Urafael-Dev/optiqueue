import { CategoryScale, Chart, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js';
import { minutes, num, usd } from '../lib/format.js';
import { lifecycle, onAbort, sectionHead } from './common.js';
import graficoPng from '../../python/salidas/grafico_analitico.png';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip);

/** Colores leídos del tema activo (claro u oscuro). */
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const palette = () => {
  const dark = document.documentElement.classList.contains('dark');
  return {
    total: cssVar('--color-accent') || '#2f5bd3',
    service: dark ? '#7b8aa5' : '#94a3b8',
    wait: dark ? '#fb923c' : '#c2410c',
    wq: dark ? '#4ade80' : '#15803d',
    sla: dark ? '#f87171' : '#b91c1c',
    opt: dark ? 'rgba(107,143,240,0.13)' : 'rgba(47,91,211,0.07)',
    grid: cssVar('--color-line') || '#eef1f5',
    text: cssVar('--color-slate-500') || '#64748b',
    axis: dark ? '#3a4a66' : '#cbd5e1',
    bg: cssVar('--color-surface') || '#fff',
  };
};
let C = palette();

/** Fondo blanco (exportación PNG), franja del óptimo y línea del SLA. */
const overlay = {
  id: 'overlay',
  beforeDraw(chart, _a, o) {
    const { ctx, chartArea: a, scales } = chart;
    ctx.save();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, chart.width, chart.height);
    const i = chart.data.labels.indexOf(o.optLabel);
    if (i >= 0) {
      const x = scales.x.getPixelForValue(i);
      const w = (scales.x.getPixelForValue(1) - scales.x.getPixelForValue(0)) * 0.7;
      ctx.fillStyle = C.opt;
      ctx.fillRect(x - w / 2, a.top, w, a.bottom - a.top);
      ctx.fillStyle = C.total;
      ctx.font = '500 11px "Inter Variable", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('óptimo', x, a.top + 12);
    }
    ctx.restore();
  },
  afterDatasetsDraw(chart, _a, o) {
    if (!chart.isDatasetVisible(3)) return;
    const { ctx, chartArea: a, scales } = chart;
    const y = scales.yTime.getPixelForValue(o.slaMin);
    ctx.save();
    ctx.strokeStyle = C.sla;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(a.left, y);
    ctx.lineTo(a.right, y);
    ctx.stroke();
    ctx.fillStyle = C.sla;
    ctx.font = '500 11px "Inter Variable", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`límite de espera: ${num(o.slaMin, 0)} min`, a.right - 4, y - 6);
    ctx.restore();
  },
};

export function renderChart(el, P, opt) {
  const signal = lifecycle(el);
  C = palette();
  const data = opt.feasible;
  const series = [
    { key: 'total', label: 'Costo total', axis: 'yCost', get: (s) => s.totalCost, fmt: (v) => `${usd(v)}/h`, width: 2.5, radius: 3 },
    { key: 'service', label: 'Costo de ventanillas', axis: 'yCost', get: (s) => s.serviceCost, fmt: (v) => `${usd(v)}/h`, width: 1.5, radius: 0, dash: [5, 4] },
    { key: 'wait', label: 'Costo de espera', axis: 'yCost', get: (s) => s.waitCost, fmt: (v) => `${usd(v)}/h`, width: 1.5, radius: 0 },
    { key: 'wq', label: 'Espera Wq (eje derecho)', axis: 'yTime', get: (s) => s.Wq * 60, fmt: (v) => minutes(v / 60), width: 1.5, radius: 0 },
  ];

  el.innerHTML = `
    ${sectionHead({
      n: 2,
      id: 'h-grafico',
      title: 'Costo total frente a tiempo de espera',
      desc: `Más ventanillas reducen la espera pero encarecen la operación. El costo total es mínimo en ${opt.x}.`,
      actions: `<div class="flex flex-wrap items-center gap-3">
        <div class="seg-sm" role="group" aria-label="Tipo de gráfico">
          <button type="button" data-view="chart" aria-pressed="true">Interactivo</button>
          <button type="button" data-view="mpl" aria-pressed="false">Matplotlib</button>
        </div>
        <button type="button" class="link" data-chart-export><i data-lucide="download"></i>Descargar PNG</button>
      </div>`,
    })}
    <div class="panel p-4 sm:p-6" data-pane="chart">
      <div class="flex flex-wrap gap-x-5 gap-y-2" role="group" aria-label="Mostrar u ocultar series">
        ${series
          .map(
            (s, i) => `<button type="button" class="toggle" data-series="${i}" aria-pressed="true">
              <span class="inline-block w-4 ${s.dash ? 'border-t-2 border-dashed' : 'h-0.5'}" data-swatch="${s.key}" style="${s.dash ? `border-color:${C[s.key]}` : `background:${C[s.key]}`}"></span>${s.label}</button>`,
          )
          .join('')}
      </div>
      <div class="relative h-[300px] sm:h-[380px] mt-5">
        <canvas role="img" aria-label="Costo total y tiempo de espera según el número de ventanillas; el costo mínimo está en ${opt.x}."></canvas>
      </div>
    </div>
    <figure class="panel overflow-hidden" data-pane="mpl" hidden>
      <img src="${graficoPng}" width="2000" height="1100" loading="lazy" decoding="async" class="w-full h-auto bg-surface"
        alt="Gráfico generado con Matplotlib: costo total y tiempo de espera según el número de ventanillas, con el óptimo en ${opt.x} y el límite de ${num(P.wqMaxH * 60, 0)} minutos." />
      <figcaption class="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 sm:px-6 py-3 text-sm text-slate-500">
        <span>Imagen real generada por <code class="font-mono text-ink">python/grafico.py</code> con Matplotlib.</span>
        <a href="#codigo" class="link" data-goto-code="grafico.py">Ver el código<i data-lucide="arrow-right"></i></a>
      </figcaption>
    </figure>`;

  const font = { family: '"Inter Variable", sans-serif', size: 12 };
  const chart = new Chart(el.querySelector('canvas'), {
    type: 'line',
    data: {
      labels: data.map((s) => String(s.c)),
      datasets: series.map((s) => ({
        label: s.label,
        data: data.map(s.get),
        yAxisID: s.axis,
        borderColor: C[s.key],
        backgroundColor: C[s.key],
        borderWidth: s.width,
        borderDash: s.dash,
        pointRadius: s.radius,
        pointHoverRadius: 4,
        tension: 0.3,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 300 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        overlay: { optLabel: String(opt.x), slaMin: P.wqMaxH * 60 },
        tooltip: {
          backgroundColor: '#0f1b2d',
          padding: 10,
          cornerRadius: 6,
          titleFont: { ...font, weight: 600 },
          bodyFont: font,
          boxWidth: 8,
          boxHeight: 8,
          callbacks: {
            title: (it) => `${it[0].label} ventanillas`,
            label: (ctx) => ` ${series[ctx.datasetIndex].label.replace(' (eje derecho)', '')}: ${series[ctx.datasetIndex].fmt(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: C.axis },
          ticks: { color: C.text, font },
          title: { display: true, text: 'Ventanillas abiertas', color: C.text, font },
        },
        yCost: {
          position: 'left',
          min: 0,
          border: { display: false },
          grid: { color: C.grid },
          ticks: { color: C.text, font, callback: (v) => `$${num(v, 0)}` },
        },
        yTime: {
          position: 'right',
          min: 0,
          max: Math.ceil(P.wqMaxH * 60 * 1.15),
          border: { display: false },
          grid: { drawOnChartArea: false },
          ticks: { color: C.text, font, callback: (v) => `${num(v, 0)} min` },
        },
      },
    },
    plugins: [overlay],
  });

  el.querySelectorAll('[data-series]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.series);
      const visible = !chart.isDatasetVisible(i);
      chart.setDatasetVisibility(i, visible);
      btn.setAttribute('aria-pressed', String(visible));
      chart.update();
    });
  });

  onAbort(signal, () => chart.destroy());

  // Cambio de tema: recolorear sin recrear el gráfico
  document.addEventListener('themechange', () => {
    C = palette();
    chart.data.datasets.forEach((ds, i) => {
      ds.borderColor = C[series[i].key];
      ds.backgroundColor = C[series[i].key];
    });
    const sc = chart.options.scales;
    sc.x.border.color = C.axis;
    for (const k of ['x', 'yCost', 'yTime']) {
      sc[k].ticks.color = C.text;
      if (sc[k].title) sc[k].title.color = C.text;
    }
    sc.yCost.grid.color = C.grid;
    el.querySelectorAll('[data-swatch]').forEach((sw) => {
      const c = C[sw.dataset.swatch];
      if (sw.style.borderColor) sw.style.borderColor = c;
      else sw.style.background = c;
    });
    chart.update('none');
  }, { signal });

  let view = 'chart';
  el.querySelectorAll('[data-view]').forEach((btn) =>
    btn.addEventListener('click', () => {
      view = btn.dataset.view;
      el.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      el.querySelectorAll('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== view));
      if (view === 'chart') chart.resize();
    }),
  );

  el.querySelector('[data-chart-export]').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = view === 'mpl' ? graficoPng : chart.toBase64Image('image/png', 1);
    a.download = view === 'mpl' ? 'grafico_analitico.png' : 'costo-vs-espera.png';
    a.click();
  });
}
