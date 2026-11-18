import { mmc, optimize } from '../lib/queue.js';
import { createLiveSim } from '../lib/liveSim.js';
import { minutes, num, pct, seconds, usd } from '../lib/format.js';
import { refreshIcons } from '../ui.js';
import { sectionHead, sub } from './common.js';

const SPEEDS = [
  { label: '×1', minPerSec: 1 },
  { label: '×5', minPerSec: 5 },
  { label: '×20', minPerSec: 20 },
];
const LAMBDA_RANGE = { min: 120, max: 240, step: 10 };
const HISTORY_MIN = 90; // minutos simulados que muestra el gráfico de la cola
const MAX_DOTS = 48;

const clock = (h) => {
  const totalMin = Math.floor(h * 60);
  return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
};

export function renderTwin(el, P, opt, store) {
  let lam = P.lambda;
  let speed = 1;
  let playing = false; // el usuario la inicia
  let started = false;
  let visible = false;

  const ticks = (from, to, step = 1) =>
    Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => `<span>${from + i * step}</span>`).join('');

  el.innerHTML = `
    ${sectionHead({
      n: 4,
      id: 'h-gemelo',
      title: 'Gemelo digital',
      desc: 'Réplica en vivo de la sala de migración. Cambia las ventanillas abiertas o la demanda y compara lo que predice el modelo con lo que ocurre en la simulación.',
    })}

    <div class="panel overflow-hidden">
      <!-- Controles de escenario -->
      <div class="grid grid-cols-1 md:grid-cols-2 border-b border-line">
        <div class="p-5 sm:p-6 space-y-3">
          <div class="flex items-baseline justify-between gap-3">
            <label for="twinX" class="text-sm font-medium text-ink">Ventanillas abiertas</label>
            <div class="flex gap-1.5">
              <button type="button" class="chip-btn" data-preset="${opt.x}">Óptimo · ${opt.x}</button>
              <button type="button" class="chip-btn" data-preset="${P.baseWindows}">Actual · ${P.baseWindows}</button>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <output for="twinX" class="w-12 text-3xl font-semibold text-ink num" data-x-out></output>
            <div class="flex-1">
              <input id="twinX" type="range" class="slider" min="${P.xMin}" max="${P.xMax}" step="1" />
              <div class="slider-ticks" aria-hidden="true">${ticks(P.xMin, P.xMax)}</div>
            </div>
          </div>
        </div>
        <div class="p-5 sm:p-6 space-y-3 border-t md:border-t-0 md:border-l border-line">
          <div class="flex items-baseline justify-between gap-3">
            <label for="twinLam" class="text-sm font-medium text-ink">Demanda (λ)</label>
            <button type="button" class="chip-btn" data-lam-reset>Enunciado · ${P.lambda}</button>
          </div>
          <div class="flex items-center gap-4">
            <output for="twinLam" class="w-28 text-3xl font-semibold text-ink num" data-lam-out></output>
            <div class="flex-1">
              <input id="twinLam" type="range" class="slider" min="${LAMBDA_RANGE.min}" max="${LAMBDA_RANGE.max}" step="${LAMBDA_RANGE.step}" value="${lam}" />
              <div class="slider-ticks" aria-hidden="true">${ticks(LAMBDA_RANGE.min, LAMBDA_RANGE.max, 30)}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-[1fr_22rem]">
        <!-- Sala -->
        <div class="relative p-5 sm:p-6 space-y-5 min-w-0">
          <div class="twin-start" data-start-overlay>
            <div class="text-center max-w-xs px-4">
              <button type="button" class="btn btn-primary h-11 px-5 text-base" data-start><i data-lucide="play"></i>Iniciar simulación</button>
              <p class="mt-3 text-sm text-slate-600">Verás llegar a los pasajeros, la cola y las ventanillas en tiempo real. Puedes pausarla cuando quieras.</p>
            </div>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-ink">Sala de migración</p>
              <p class="text-xs text-slate-500">Hora simulada <span class="font-mono text-ink" data-clock>00:00</span> · <span data-served>0</span> pasajeros atendidos</p>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" class="btn w-[7.5rem]" data-play></button>
              <div class="seg-sm" role="group" aria-label="Velocidad: minutos simulados por segundo">
                ${SPEEDS.map((s, i) => `<button type="button" data-speed="${i}" aria-pressed="${i === speed}">${s.label}</button>`).join('')}
              </div>
              <button type="button" class="btn w-9 px-0" data-reset aria-label="Reiniciar simulación"><i data-lucide="rotate-ccw"></i></button>
            </div>
          </div>

          <div>
            <div class="flex items-baseline justify-between text-xs text-slate-500 mb-2">
              <span>En cola: <span class="text-ink font-medium num" data-qlen>0</span></span>
              <span>Espera del primero: <span class="text-ink num" data-qhead>—</span></span>
            </div>
            <div class="min-h-[2.75rem] rounded-lg border border-dashed border-line bg-slate-50/60 px-3 py-2.5 flex flex-wrap items-center gap-1.5" data-queue aria-hidden="true"></div>
          </div>

          <div>
            <div class="grid grid-cols-5 sm:grid-cols-10 gap-1.5" data-booths aria-hidden="true">
              ${Array.from(
                { length: P.xMax },
                (_, i) => `
                <div class="booth" data-booth>
                  <span class="booth-num">${i + 1}</span>
                  <span class="booth-state"></span>
                  <span class="booth-bar"><span></span></span>
                </div>`,
              ).join('')}
            </div>
            <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-navy"></span>Atendiendo</span>
              <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm border border-accent bg-accent-soft"></span>Libre</span>
              <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm border border-dashed border-slate-300"></span>Cerrada</span>
              <span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-bad"></span>Espera &gt; ${num(P.wqMaxH * 60, 0)} min</span>
            </div>
          </div>

          <figure>
            <figcaption class="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>Pasajeros en cola · últimos ${HISTORY_MIN} min simulados</span>
              <span class="inline-flex items-center gap-1.5"><span class="w-4 border-t border-dashed border-accent"></span><span>L<sub>q</sub> del modelo</span></span>
            </figcaption>
            <svg class="w-full h-20 rounded-lg bg-slate-50/60 border border-line" viewBox="0 0 300 80" preserveAspectRatio="none" data-spark aria-hidden="true">
              <line data-spark-model x1="0" x2="300" stroke="#2f5bd3" stroke-dasharray="4 4" stroke-width="1" vector-effect="non-scaling-stroke" />
              <polyline data-spark-line fill="none" stroke="#0f1b2d" stroke-width="1.5" vector-effect="non-scaling-stroke" />
            </svg>
          </figure>
        </div>

        <!-- Indicadores -->
        <aside class="p-5 sm:p-6 border-t xl:border-t-0 xl:border-l border-line space-y-5" aria-live="polite">
          <table class="table w-full text-sm -mx-3 w-[calc(100%+1.5rem)]">
            <thead><tr><th scope="col">Indicador</th><th scope="col">Modelo</th><th scope="col">En vivo</th></tr></thead>
            <tbody data-metrics></tbody>
          </table>
          <p class="text-xs text-slate-500" data-window></p>
          <div data-sla></div>
          <div class="rounded-lg bg-slate-50 border border-line p-4 text-sm" data-reco></div>
        </aside>
      </div>
    </div>`;

  const $ = (s) => el.querySelector(s);
  const xSlider = $('#twinX');
  const lamSlider = $('#twinLam');
  const boothEls = [...el.querySelectorAll('[data-booth]')];
  const sim = createLiveSim({ c: store.get().x, lambda: lam, mu: P.mu, maxBooths: P.xMax });
  let history = [];
  let lastSample = 0;

  // ---------- Panel de indicadores ----------
  const updateModel = () => {
    const x = store.get().x;
    const params = { ...P, lambda: lam };
    const m = mmc(x, params);
    const best = optimize(params);
    const snap = sim.snapshot();
    const liveCost = P.cs * x + P.cw * snap.lq;
    const enough = snap.elapsed * 60 >= 20;
    const live = (v) => (enough ? v : '<span class="text-slate-400">…</span>');

    $('[data-metrics]').innerHTML = [
      ['Utilización (ρ)', m.stable ? pct(m.rho) : `<span class="text-bad">${pct(m.rho)}</span>`, live(pct(snap.rho))],
      [`En cola (${sub('L', 'q')})`, m.stable ? num(m.Lq, 2) : '∞', live(num(snap.lq, 2))],
      [`Espera (${sub('W', 'q')})`, m.stable ? seconds(m.Wq) : '∞', live(seconds(snap.wq))],
      ['Costo total', m.stable ? usd(m.totalCost, 0) : '∞', live(usd(liveCost, 0))],
    ]
      .map(([k, a, b]) => `<tr><td class="!text-left text-slate-600">${k}</td><td class="text-ink">${a}</td><td class="text-ink font-medium">${b}</td></tr>`)
      .join('');

    $('[data-window]').textContent = enough
      ? `«En vivo» promedia ${num(snap.elapsed * 60, 0)} min simulados desde el último cambio. Cuanto más avanza, más se acerca al modelo.`
      : 'Reuniendo datos: los valores en vivo aparecen tras 20 min simulados.';

    $('[data-sla]').innerHTML = !m.stable
      ? `<p class="text-sm font-medium text-bad">Sistema inestable</p><p class="text-sm text-slate-600 mt-0.5">Se atienden ${x * P.mu} pasajeros/h pero llegan ${lam}: la cola crece sin límite.</p>`
      : m.meetsSla
        ? `<p class="text-sm font-medium text-ok">Cumple el nivel de servicio</p><p class="text-sm text-slate-600 mt-0.5">Espera promedio de ${minutes(m.Wq)} frente a un límite de ${num(P.wqMaxH * 60, 0)} min.</p>`
        : `<p class="text-sm font-medium text-bad">No cumple el nivel de servicio</p><p class="text-sm text-slate-600 mt-0.5">Espera promedio de ${minutes(m.Wq, 1)}, por encima del límite.</p>`;

    let reco;
    if (best.status !== 'Optimal') {
      reco = `<p class="font-medium text-ink">Sin solución factible</p><p class="text-slate-600 mt-0.5">Con λ = ${lam} ninguna configuración de hasta ${P.xMax} ventanillas cumple el límite de espera.</p>`;
    } else if (best.x === x) {
      reco = `<p class="font-medium text-ink">Configuración óptima</p><p class="text-slate-600 mt-0.5">Para λ = ${lam} pas/h, ${x} ventanillas dan el menor costo: ${usd(best.y)}/h.</p>`;
    } else {
      const delta = m.stable ? m.totalCost - best.y : Infinity;
      reco = `<p class="font-medium text-ink">Recomendación: ${best.x} ventanillas</p>
        <p class="text-slate-600 mt-0.5">Para λ = ${lam} pas/h el costo mínimo es ${usd(best.y)}/h${Number.isFinite(delta) ? `, ${usd(delta)}/h menos que ahora` : ''}.</p>
        <button type="button" class="link mt-2" data-apply="${best.x}">Aplicar ${best.x} ventanillas<i data-lucide="arrow-right"></i></button>`;
    }
    $('[data-reco]').innerHTML = reco;
    refreshIcons();

    modelLq = m.stable ? m.Lq : null;
    drawSpark();
  };

  let sparkMax = 5;
  let modelLq = null;
  const drawSpark = () => {
    sparkMax = Math.max(5, ...history, (modelLq ?? 0) * 1.25);
    const line = $('[data-spark-model]');
    line.style.display = modelLq === null ? 'none' : '';
    if (modelLq !== null) {
      const y = sparkY(modelLq).toFixed(1);
      line.setAttribute('y1', y);
      line.setAttribute('y2', y);
    }
    const step = 300 / (HISTORY_MIN - 1);
    $('[data-spark-line]').setAttribute('points', history.map((v, i) => `${(i * step).toFixed(1)},${sparkY(v).toFixed(1)}`).join(' '));
  };
  const sparkY = (v) => 78 - (Math.min(v, sparkMax) / sparkMax) * 74;

  // ---------- Sala ----------
  const drawRoom = (snap) => {
    $('[data-clock]').textContent = clock(snap.t);
    $('[data-served]').textContent = num(snap.served, 0);

    snap.booths.forEach((b, i) => {
      const state = b.busy ? (b.open ? 'busy' : 'closing') : b.open ? 'idle' : 'closed';
      const node = boothEls[i];
      if (node.dataset.state !== state) {
        node.dataset.state = state;
        node.querySelector('.booth-state').textContent = { busy: 'Atiende', closing: 'Cierra', idle: 'Libre', closed: 'Cerrada' }[state];
      }
      node.querySelector('.booth-bar > span').style.width = `${(b.progress * 100).toFixed(1)}%`;
    });

    const q = snap.queue;
    $('[data-qlen]').textContent = `${num(q.length, 0)} ${q.length === 1 ? 'pasajero' : 'pasajeros'}`;
    $('[data-qhead]').textContent = q.length ? seconds(q[0], 0) : '—';
    const dots = q
      .slice(0, MAX_DOTS)
      .map((w) => `<span class="w-2.5 h-2.5 rounded-full ${w > P.wqMaxH ? 'bg-bad' : 'bg-slate-400'}"></span>`)
      .join('');
    $('[data-queue]').innerHTML =
      dots + (q.length > MAX_DOTS ? `<span class="text-xs text-slate-500 ml-1">+${num(q.length - MAX_DOTS, 0)}</span>` : '') ||
      '<span class="text-xs text-slate-400">Sin cola</span>';

    // Historia de la cola (una muestra por minuto simulado)
    while (snap.t - lastSample >= 1 / 60) {
      lastSample += 1 / 60;
      history.push(q.length);
      if (history.length > HISTORY_MIN) history.shift();
    }
    drawSpark();
  };

  // ---------- Bucle de animación ----------
  let raf = 0;
  let lastFrame = 0;
  let lastPanel = 0;
  const frame = (now) => {
    const dtReal = Math.min(0.1, (now - lastFrame) / 1000); // evita saltos al volver a la pestaña
    lastFrame = now;
    sim.step((dtReal * SPEEDS[speed].minPerSec) / 60, P.wqMaxH);
    drawRoom(sim.snapshot());
    if (now - lastPanel > 400) {
      lastPanel = now;
      updateModel();
    }
    raf = requestAnimationFrame(frame);
  };
  const sync = () => {
    const run = playing && visible;
    if (run && !raf) {
      lastFrame = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    const btn = $('[data-play]');
    btn.classList.toggle('btn-primary', !playing);
    btn.innerHTML = `<i data-lucide="${playing ? 'pause' : 'play'}"></i>${playing ? 'Pausar' : 'Reproducir'}`;
    refreshIcons();
  };
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    sync();
  }).observe(el);
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden && el.getBoundingClientRect().top < innerHeight;
    sync();
  });

  // ---------- Eventos ----------
  xSlider.addEventListener('input', () => store.set({ x: Number(xSlider.value) }));
  el.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => store.set({ x: Number(b.dataset.preset) })));
  el.addEventListener('click', (e) => {
    const apply = e.target.closest('[data-apply]');
    if (apply) store.set({ x: Number(apply.dataset.apply) });
  });

  const setLambda = (v) => {
    lam = v;
    lamSlider.value = String(v);
    $('[data-lam-out]').innerHTML = `${v}<span class="text-sm font-normal text-slate-500"> pas/h</span>`;
    lamSlider.setAttribute('aria-valuetext', `${v} pasajeros por hora`);
    sim.setLambda(v);
    updateModel();
  };
  lamSlider.addEventListener('input', () => setLambda(Number(lamSlider.value)));
  $('[data-lam-reset]').addEventListener('click', () => setLambda(P.lambda));

  const start = () => {
    if (!started) {
      started = true;
      $('[data-start-overlay]').remove();
    }
  };
  $('[data-start]').addEventListener('click', () => {
    start();
    playing = true;
    sync();
  });
  $('[data-play]').addEventListener('click', () => {
    start();
    playing = !playing;
    sync();
  });
  el.querySelectorAll('[data-speed]').forEach((b) =>
    b.addEventListener('click', () => {
      speed = Number(b.dataset.speed);
      el.querySelectorAll('[data-speed]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    }),
  );
  $('[data-reset]').addEventListener('click', () => {
    sim.reset();
    history = [];
    lastSample = 0;
    drawRoom(sim.snapshot());
    updateModel();
  });

  store.subscribe(({ x }) => {
    xSlider.value = String(x);
    $('[data-x-out]').textContent = String(x);
    xSlider.setAttribute('aria-valuetext', `${x} ventanillas`);
    sim.setOpen(x, P.wqMaxH);
    drawRoom(sim.snapshot());
    updateModel();
  });

  // Estado inicial: una hora de sala ya en marcha, para no arrancar con la sala vacía
  sim.step(1, P.wqMaxH);
  sim.setOpen(store.get().x, P.wqMaxH);
  lastSample = sim.snapshot().t;
  xSlider.value = String(store.get().x);
  $('[data-x-out]').textContent = String(store.get().x);
  setLambda(lam);
  drawRoom(sim.snapshot());
  sync();
}
