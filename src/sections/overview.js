import heroVideo960 from '../assets/hero-960.mp4';
import heroVideo640 from '../assets/hero-640.mp4';
import heroPoster960 from '../assets/hero-poster-960.webp';
import heroPoster640 from '../assets/hero-poster-640.webp';
import { refreshIcons } from '../ui.js';
import { minutes, num, pct, seconds, usd, usdCompact } from '../lib/format.js';
import { sectionHead, sub } from './common.js';

export function renderParamsCard(el, P, opt, exploring = false) {
  const b = opt.best;
  const params = [
    ['λ', 'Llegadas', `${P.lambda}/h`],
    ['μ', 'Por ventanilla', `${P.mu}/h`],
    [sub('C', 's'), 'Costo ventanilla', `$${P.cs}/h`],
    [sub('C', 'w'), 'Costo espera', `$${P.cw}/h`],
    [sub('W', 'q'), 'Espera máxima', `${num(P.wqMaxH * 60, 0)} min`],
  ];

  el.innerHTML = `
    <div class="px-3.5 pt-3 pb-2.5 [@media(max-height:760px)]:hidden">
      <div class="flex items-center justify-between">
        <p class="text-[11px] font-medium uppercase tracking-wider ${exploring ? 'text-[#c4b5fd]' : 'text-slate-500'}">${exploring ? 'En exploración' : 'Datos del caso'}</p>
        <button type="button" class="text-[11px] text-slate-400 hover:text-white cursor-pointer" data-open="dlgEnunciado">Caso</button>
      </div>
      <dl class="mt-2 space-y-1.5">
        ${params
          .map(
            ([sym, label, value]) => `
          <div class="flex items-center gap-2.5 text-xs">
            <dt class="contents">
              <span class="w-7 shrink-0 rounded bg-white/[0.06] py-0.5 text-center font-mono text-[11px] text-[#8fb0ff]">${sym}</span>
              <span class="flex-1 text-slate-400">${label}</span>
            </dt>
            <dd class="tabular-nums text-slate-100">${value}</dd>
          </div>`,
          )
          .join('')}
      </dl>
    </div>

    <button type="button" data-action="open-opt"
      class="group block w-full border-t border-white/[0.08] [@media(max-height:760px)]:border-t-0 bg-[#8fb0ff]/[0.07] px-3.5 py-3 text-left hover:bg-[#8fb0ff]/[0.12] transition-colors cursor-pointer">
      <span class="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-[#8fb0ff]">
        Solución óptima
        <i data-lucide="arrow-right" class="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition"></i>
      </span>
      <span class="mt-1.5 flex items-baseline gap-1.5">
        <span class="text-2xl font-semibold leading-none text-white tabular-nums">${b.c}</span>
        <span class="text-xs text-slate-300">ventanillas</span>
        <span class="ml-auto text-sm font-medium text-white tabular-nums">${usd(b.totalCost, 0)}<span class="text-xs font-normal text-slate-400">/h</span></span>
      </span>
      <span class="mt-1.5 block text-[11px] text-slate-400 tabular-nums">Espera ${seconds(b.Wq, 0)} · utilización ${pct(b.rho, 0)}</span>
    </button>`;
}

export function renderTopSavings(el, sv) {
  el.innerHTML = `Ahorro estimado: <span class="font-medium text-ok">${usdCompact(sv.annual)}/año</span>`;
}

export function renderIntro(el, P, opt, sv) {
  const b = opt.best;
  const params = [
    ['Llegadas', `λ = ${P.lambda} pas/h`],
    ['Servicio', `μ = ${P.mu} pas/h por ventanilla`],
    ['Costo ventanilla', `${usd(P.cs, 0)}/h`],
    ['Costo de espera', `${usd(P.cw, 0)}/h por pasajero`],
    ['Nivel de servicio', `${sub('W', 'q')} ≤ ${num(P.wqMaxH * 60, 0)} min`],
  ];
  // cada indicador con su color e icono
  const metrics = [
    ['Ventanillas óptimas', `${b.c}`, `frente a ${P.baseWindows} actuales`, 'door-open', '#2563eb'],
    ['Costo total', `${usd(b.totalCost)}<span class="text-base text-slate-400 font-normal">/h</span>`, `${usd(b.serviceCost, 0)} operación + ${usd(b.waitCost)} espera`, 'wallet', '#7c3aed'],
    ['Espera promedio', seconds(b.Wq, 1), `límite: ${num(P.wqMaxH * 60, 0)} min`, 'timer', '#0891b2'],
    ['Ahorro anual', usdCompact(sv.annual), `−${pct(sv.pctReported)} vs. costo reportado`, 'piggy-bank', '#16a34a'],
  ];

  const paramsHtml = params.map(([k, v]) => `<div class="kv"><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  const metricsHtml = metrics
    .map(
      ([k, v, h, icon, c], i) => `
        <div class="kpi" style="--c: ${c}; --i: ${i}">
          <div class="flex items-start justify-between gap-2">
            <dt class="label">${k}</dt>
            <span class="kpi-icon"><i data-lucide="${icon}"></i></span>
          </div>
          <dd class="mt-1 text-2xl sm:text-[1.75rem] font-semibold text-ink num tracking-tight">${v}</dd>
          <dd class="mt-1 text-xs text-slate-500">${h}</dd>
        </div>`,
    )
    .join('');

  // Al recalcular (modo exploración) solo se cambian los datos: el vídeo sigue intacto
  if (el.querySelector('[data-intro-params]')) {
    el.querySelector('[data-intro-params]').innerHTML = paramsHtml;
    el.querySelector('[data-intro-metrics]').innerHTML = metricsHtml;
    refreshIcons();
    return;
  }

  el.innerHTML = `
    <div class="panel overflow-hidden grid grid-cols-1 lg:grid-cols-12">
      <div class="lg:col-span-7 p-6 sm:p-8">
        <p class="text-sm font-medium text-accent">Caso · Control migratorio</p>
        <h1 id="titulo-principal" class="mt-2 text-2xl sm:text-[2rem] font-semibold tracking-tight leading-tight text-balance">
          Optimización de colas en el control migratorio del aeropuerto
        </h1>
        <p class="mt-3 text-slate-600 max-w-xl">
          ¿Cuántas ventanillas abrir en hora pico? Resolución analítica (Erlang C), simulación de eventos discretos y programación entera
          para minimizar el costo total sin superar ${num(P.wqMaxH * 60, 0)} minutos de espera promedio.
        </p>
        <dl class="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 text-sm max-w-xl" data-intro-params>${paramsHtml}</dl>
      </div>
      <div class="order-first lg:order-none lg:col-span-5 relative aspect-video sm:aspect-[21/9] lg:aspect-auto bg-slate-200 overflow-hidden">
        <video class="absolute inset-0 w-full h-full object-cover object-[70%_center]" muted loop playsinline preload="metadata"
               poster="${heroPoster960}" aria-hidden="true" tabindex="-1" disablepictureinpicture data-hero-video>
          <source src="${heroVideo640}" type="video/mp4" media="(max-width: 767px)" />
          <source src="${heroVideo960}" type="video/mp4" />
        </video>
        <button type="button" class="hero-video-btn" data-hero-toggle aria-label="Pausar el vídeo de fondo" hidden>
          <i data-lucide="pause"></i>
        </button>
      </div>
    </div>

    <dl class="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" data-intro-metrics>${metricsHtml}</dl>`;

  setupHeroVideo(el);
}

/**
 * Vídeo decorativo de la portada: solo se reproduce si el usuario no pidió
 * reducir el movimiento ni ahorrar datos, se pausa fuera de pantalla y tiene
 * un botón para detenerlo (contenido en movimiento de más de 5 s).
 */
function setupHeroVideo(el) {
  const video = el.querySelector('[data-hero-video]');
  const btn = el.querySelector('[data-hero-toggle]');
  if (!video) return;
  if (window.matchMedia('(max-width: 767px)').matches) video.poster = heroPoster640;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection?.saveData === true;
  if (reduceMotion || saveData) {
    video.preload = 'none'; // se queda el póster (un fotograma del vídeo)
    return;
  }

  let userPaused = false;
  let visible = false;
  const sync = () => {
    const shouldPlay = visible && !userPaused && !document.hidden;
    if (shouldPlay && video.paused) video.play().catch(() => {});
    else if (!shouldPlay && !video.paused) video.pause();
    const playing = !userPaused;
    btn.setAttribute('aria-label', playing ? 'Pausar el vídeo de fondo' : 'Reproducir el vídeo de fondo');
    btn.setAttribute('aria-pressed', String(!playing));
    btn.innerHTML = `<i data-lucide="${playing ? 'pause' : 'play'}"></i>`;
    refreshIcons();
  };
  btn.hidden = false;
  btn.addEventListener('click', () => {
    userPaused = !userPaused;
    sync();
  });
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    sync();
  }).observe(video);
  document.addEventListener('visibilitychange', sync);
}

export function renderAnswers(el, P, opt, sv) {
  const b = opt.best;
  const prev = opt.all.find((s) => s.c === b.c - 1);
  const next = opt.all.find((s) => s.c === b.c + 1);
  const base = sv.base;

  const block = (n, question, answer, rows, note) => `
    <article class="panel p-6 flex flex-col">
      <p class="text-sm text-slate-500"><span class="font-mono text-slate-400 mr-1.5">${n === 1 ? 'Decisión' : 'Impacto'}</span>${question}</p>
      <p class="mt-4 text-2xl font-semibold text-ink tracking-tight num">${answer}</p>
      <dl class="mt-4">${rows.map(([k, v]) => `<div class="kv"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      <p class="mt-4 text-sm text-slate-600">${note}</p>
    </article>`;

  el.innerHTML = `
    ${sectionHead({
      n: 1,
      id: 'h-respuestas',
      title: 'Recomendación',
      actions: `<button type="button" class="link" data-action="open-opt">Ver resolución paso a paso<i data-lucide="arrow-right"></i></button>`,
    })}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      ${block(
        1,
        `¿Cuál es el número entero óptimo de ventanillas que minimiza el costo total cumpliendo la restricción de ${num(P.wqMaxH * 60, 0)} minutos?`,
        `${b.c} ventanillas, ${usd(b.totalCost)}/h`,
        [
          [`Espera promedio (${sub('W', 'q')})`, `${minutes(b.Wq)} · ${seconds(b.Wq)}`],
          ['Utilización (ρ)', pct(b.rho)],
          ['Probabilidad de esperar', pct(b.Pw)],
          [`Costo con ${prev.c} / ${next.c} ventanillas`, `${usd(prev.totalCost)} / ${usd(next.totalCost)}`],
        ],
        `El costo es convexo en x: sube a ambos lados de ${b.c}, así que es el mínimo global. Con ${opt.xSla} o más ventanillas ya se cumple el límite de espera.`,
      )}
      ${block(
        2,
        `¿Qué impacto tiene la solución en espera y costo por hora frente a las ${P.baseWindows} ventanillas fijas?`,
        `Ahorra ${usd(sv.perHourReported)}/h <span class="text-base font-normal text-slate-500">(−${pct(sv.pctReported)})</span>`,
        [
          ['Ahorro anual', `${usd(sv.annual, 0)}`],
          ['Ahorro vs. costo teórico de 16', `${usd(sv.perHourTheoretical)}/h`],
          ['Espera promedio', `${seconds(base.Wq)} → ${seconds(b.Wq)}`],
        ],
        `Cerrar una ventanilla ahorra ${usd(P.cs, 0)}/h y añade ${usd(b.waitCost - base.waitCost)}/h de costo de espera; cada pasajero espera ${seconds(sv.waitDeltaH)} más en promedio. Anualizado con ${P.peakHoursPerDay} h pico diarias.`,
      )}
    </div>
    <p class="text-sm text-slate-500 max-w-3xl">
      <span class="text-ink font-medium">Nota.</span> El cliente reporta ${usd(P.reportedBaseCost, 0)}/h para las ${P.baseWindows} ventanillas,
      pero el modelo M/M/c da ${usd(base.totalCost)}/h. El ahorro principal se mide contra la cifra reportada.
    </p>`;
}
