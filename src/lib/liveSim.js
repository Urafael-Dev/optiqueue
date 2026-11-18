import { mulberry32 } from './simulation.js';

/**
 * Simulación M/M/c que avanza por pasos de tiempo para animar el gemelo digital.
 * El reloj está en horas. Los parámetros (ventanillas y demanda) pueden cambiar en
 * caliente; las estadísticas se reinician en cada cambio para medir solo la
 * configuración vigente.
 */
export function createLiveSim({ c, lambda, mu, maxBooths, seed = 7 }) {
  const rand = mulberry32(seed);
  const exp = (rate) => -Math.log(1 - rand()) / rate;

  let t = 0;
  let open = c;
  let lam = lambda;
  let nextArrival = exp(lam);
  let nextId = 1;
  const booths = Array.from({ length: maxBooths }, () => ({ pax: null, start: 0, end: Infinity }));
  const queue = []; // { id, arrival }
  let stats;

  const resetStats = () => {
    stats = { since: t, served: 0, sumWait: 0, overSla: 0, areaQ: 0, areaBusy: 0, last: t };
  };
  resetStats();

  const busyCount = () => booths.reduce((n, b) => n + (b.pax !== null ? 1 : 0), 0);

  // Integra longitud de cola y ventanillas ocupadas hasta el instante `to`
  const accumulate = (to) => {
    const dt = to - stats.last;
    if (dt > 0) {
      stats.areaQ += queue.length * dt;
      stats.areaBusy += busyCount() * dt;
      stats.last = to;
    }
  };

  const startService = (k, pax, now, wqMax) => {
    const wait = now - pax.arrival;
    stats.served++;
    stats.sumWait += wait;
    if (wait > wqMax) stats.overSla++;
    const b = booths[k];
    b.pax = pax.id;
    b.start = now;
    b.end = now + exp(mu);
  };

  const freeOpenBooth = () => {
    for (let k = 0; k < open; k++) if (booths[k].pax === null) return k;
    return -1;
  };

  return {
    /** Avanza el reloj `dtH` horas procesando todos los eventos intermedios. */
    step(dtH, wqMax) {
      const target = t + dtH;
      for (;;) {
        let k = -1;
        let tEnd = Infinity;
        booths.forEach((b, i) => {
          if (b.end < tEnd) {
            tEnd = b.end;
            k = i;
          }
        });
        const tNext = Math.min(nextArrival, tEnd);
        if (tNext > target) break;
        accumulate(tNext);
        t = tNext;

        if (nextArrival <= tEnd) {
          const pax = { id: nextId++, arrival: t };
          nextArrival = t + exp(lam);
          const free = freeOpenBooth();
          if (free >= 0) startService(free, pax, t, wqMax);
          else queue.push(pax);
        } else {
          const b = booths[k];
          b.pax = null;
          b.end = Infinity;
          // Una ventanilla cerrada termina su atención y ya no toma más pasajeros
          if (k < open && queue.length) startService(k, queue.shift(), t, wqMax);
        }
      }
      accumulate(target);
      t = target;
    },

    setOpen(n, wqMax) {
      open = n;
      resetStats();
      for (let k = 0; k < open && queue.length; k++) {
        if (booths[k].pax === null) startService(k, queue.shift(), t, wqMax);
      }
    },

    setLambda(v) {
      lam = v;
      nextArrival = t + exp(lam); // proceso sin memoria: se puede reprogramar
      resetStats();
    },

    reset() {
      t = 0;
      nextArrival = exp(lam);
      nextId = 1;
      queue.length = 0;
      booths.forEach((b) => Object.assign(b, { pax: null, start: 0, end: Infinity }));
      resetStats();
    },

    snapshot() {
      const elapsed = t - stats.since;
      return {
        t,
        open,
        elapsed,
        queue: queue.map((p) => t - p.arrival),
        booths: booths.map((b, k) => ({
          open: k < open,
          busy: b.pax !== null,
          progress: b.pax !== null ? Math.min(1, (t - b.start) / Math.max(1e-9, b.end - b.start)) : 0,
        })),
        served: stats.served,
        wq: stats.served ? stats.sumWait / stats.served : 0,
        lq: elapsed > 0 ? stats.areaQ / elapsed : 0,
        rho: elapsed > 0 && open ? stats.areaBusy / (elapsed * open) : 0,
        overSla: stats.served ? stats.overSla / stats.served : 0,
      };
    },
  };
}
