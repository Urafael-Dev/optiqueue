/**
 * Simulación de eventos discretos M/M/c FCFS (equivalente al modelo SimPy).
 * Con disciplina FCFS y servidores idénticos, cada llegada se asigna a la
 * ventanilla que se libera antes: inicio = max(llegada, libre[k]).
 */

/** PRNG con semilla (reproducible). */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateOnce({ c, lambda, mu, cs, cw, wqMaxH, hours, warmupH = 0.25, seed = 1, logLimit = 0 }) {
  const rand = mulberry32(seed);
  const exp = (rate) => -Math.log(1 - rand()) / rate;
  const free = new Array(c).fill(0);
  const horizon = warmupH + hours;
  const log = [];

  let t = 0;
  let id = 0;
  let n = 0;
  let sumWait = 0;
  let waited = 0;
  let overSla = 0;
  let maxWait = 0;

  for (;;) {
    t += exp(lambda);
    if (t > horizon) break;
    id++;

    let k = 0;
    for (let i = 1; i < c; i++) if (free[i] < free[k]) k = i;
    const start = Math.max(t, free[k]);
    free[k] = start + exp(mu);

    if (t < warmupH) continue; // periodo de calentamiento: sistema arranca vacío
    const wait = start - t;
    n++;
    sumWait += wait;
    if (wait > 0) waited++;
    if (wait > wqMaxH) overSla++;
    if (wait > maxWait) maxWait = wait;
    if (log.length < logLimit) log.push({ id, arrival: t - warmupH, window: k + 1, wait });
  }

  const wq = n ? sumWait / n : 0;
  const lq = (n / hours) * wq; // Ley de Little con la tasa observada
  return {
    passengers: n,
    wq,
    lq,
    maxWait,
    pWait: n ? waited / n : 0,
    pOverSla: n ? overSla / n : 0,
    cost: cs * c + cw * lq,
    log,
  };
}

const T_975 = { 4: 2.776, 9: 2.262, 19: 2.093, 29: 2.045 };

export function simulate({ replications = 10, seed = 2026, ...opts }) {
  const runs = [];
  for (let r = 0; r < replications; r++) {
    runs.push(simulateOnce({ ...opts, seed: seed + r * 7919, logLimit: r === 0 ? 20 : 0 }));
  }
  const mean = (f) => runs.reduce((s, x) => s + f(x), 0) / runs.length;
  const wqMean = mean((r) => r.wq);
  const variance = runs.length > 1 ? runs.reduce((s, r) => s + (r.wq - wqMean) ** 2, 0) / (runs.length - 1) : 0;
  const t = T_975[runs.length - 1] ?? 1.96;

  return {
    replications: runs.length,
    passengers: mean((r) => r.passengers),
    wq: wqMean,
    wqHalfWidth: (t * Math.sqrt(variance)) / Math.sqrt(runs.length),
    pWait: mean((r) => r.pWait),
    pOverSla: mean((r) => r.pOverSla),
    maxWait: Math.max(...runs.map((r) => r.maxWait)),
    cost: mean((r) => r.cost),
    log: runs[0].log,
  };
}
