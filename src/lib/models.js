/**
 * Resolvedor general de modelos de colas (Taha / Hillier-Lieberman).
 *
 * Todas las tasas van en la misma unidad de tiempo (por ejemplo, por hora) y los
 * tiempos de resultado salen en esa misma unidad. Cada modelo devuelve sus
 * métricas, la distribución Pn y el desarrollo paso a paso en LaTeX.
 */

export const MODELS = {
  mm1: {
    kendall: 'M/M/1', name: 'Un servidor', icon: 'user',
    desc: 'Llegadas de Poisson, servicio exponencial, un servidor y cola ilimitada.',
    fields: ['lambda', 'mu'],
  },
  mmc: {
    kendall: 'M/M/c', name: 'Varios servidores', icon: 'users',
    desc: 'c servidores en paralelo con una sola cola (Erlang C).',
    fields: ['lambda', 'mu', 'c'],
  },
  mm1k: {
    kendall: 'M/M/1/K', name: 'Capacidad limitada', icon: 'square-stack',
    desc: 'Un servidor y como máximo K clientes en el sistema; los demás se pierden.',
    fields: ['lambda', 'mu', 'K'],
  },
  mmck: {
    kendall: 'M/M/c/K', name: 'Varios servidores, capacidad K', icon: 'layers',
    desc: 'c servidores y capacidad K. Con K = c es un sistema con pérdida (Erlang B).',
    fields: ['lambda', 'mu', 'c', 'K'],
  },
  mmcn: {
    kendall: 'M/M/c//N', name: 'Población finita', icon: 'factory',
    desc: 'N clientes potenciales (p. ej. máquinas que se averían); λ es la tasa por cliente.',
    fields: ['lambda', 'mu', 'c', 'N'],
  },
  mg1: {
    kendall: 'M/G/1', name: 'Servicio general', icon: 'activity',
    desc: 'Servicio con cualquier distribución de media 1/μ y desviación σ (Pollaczek-Khinchine).',
    fields: ['lambda', 'mu', 'sigma'],
  },
  md1: {
    kendall: 'M/D/1', name: 'Servicio constante', icon: 'timer',
    desc: 'Tiempo de servicio fijo (σ = 0), como una máquina automática.',
    fields: ['lambda', 'mu'],
  },
  mek1: {
    kendall: 'M/Eₖ/1', name: 'Servicio Erlang', icon: 'list-ordered',
    desc: 'Servicio Erlang de k fases: menos variable que el exponencial.',
    fields: ['lambda', 'mu', 'k'],
  },
  mminf: {
    kendall: 'M/M/∞', name: 'Autoservicio', icon: 'infinity',
    desc: 'Servidores ilimitados: nadie espera (autoservicio, estacionamientos grandes).',
    fields: ['lambda', 'mu'],
  },
};

export const FIELD_INFO = {
  lambda: { sym: 'λ', label: 'Tasa de llegadas', int: false },
  mu: { sym: 'μ', label: 'Tasa de servicio por servidor', int: false },
  c: { sym: 'c', label: 'Número de servidores', int: true },
  K: { sym: 'K', label: 'Capacidad del sistema', int: true },
  N: { sym: 'N', label: 'Tamaño de la población', int: true },
  sigma: { sym: 'σ', label: 'Desviación del tiempo de servicio', int: false },
  k: { sym: 'k', label: 'Fases de la distribución Erlang', int: true },
};

const MAX_STATES = 5000;

/** Número para LaTeX: hasta `d` decimales sin ceros sobrantes, coma decimal. */
export function texNum(v, d = 4) {
  if (!Number.isFinite(v)) return '\\infty';
  if (v !== 0 && Math.abs(v) < 1e-4) {
    const [m, e] = v.toExponential(3).split('e');
    return `${texNum(Number(m), 3)}\\times10^{${Number(e)}}`;
  }
  const s = Number(v.toFixed(d)).toString();
  const [int, dec] = s.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\\,');
  return dec ? `${grouped}{,}${dec}` : grouped;
}
const N_ = texNum;

class QueueInputError extends Error {}

function validate(model, p) {
  const def = MODELS[model];
  if (!def) throw new QueueInputError(`Modelo desconocido: ${model}.`);
  for (const f of def.fields) {
    const v = p[f];
    const info = FIELD_INFO[f];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new QueueInputError(`Falta ${info.label.toLowerCase()} (${info.sym}).`);
    if (info.int && !Number.isInteger(v)) throw new QueueInputError(`${info.sym} debe ser un número entero.`);
    if (f === 'sigma' ? v < 0 : v <= 0) throw new QueueInputError(`${info.sym} debe ser ${f === 'sigma' ? 'mayor o igual que 0' : 'mayor que 0'}.`);
  }
  if (model === 'mmck' && p.K < p.c) throw new QueueInputError('La capacidad K no puede ser menor que el número de servidores c.');
  if ((p.K ?? 0) > MAX_STATES || (p.N ?? 0) > MAX_STATES) throw new QueueInputError(`K y N admiten hasta ${MAX_STATES}.`);
  if ((p.c ?? 0) > 1000) throw new QueueInputError('c admite hasta 1000 servidores.');
}

/** Proceso de nacimiento y muerte finito: Pn a partir de las tasas por estado. */
function birthDeath(maxN, lam, mu) {
  const t = [1];
  for (let n = 1; n <= maxN; n++) t.push((t[n - 1] * lam(n - 1)) / mu(n));
  const sum = t.reduce((a, b) => a + b, 0);
  return t.map((x) => x / sum);
}

const sumBy = (arr, f) => arr.reduce((s, v, n) => s + f(v, n), 0);

/** Distribución Pn de un modelo infinito, truncada donde ya acumula 99,99 %. */
function tail(pnAt, cap = 400) {
  const out = [];
  let acc = 0;
  for (let n = 0; n < cap; n++) {
    const v = pnAt(n);
    out.push(v);
    acc += v;
    if (acc > 0.9999 && n > 3) break;
  }
  return out;
}

const step = (title, tex, note) => ({ title, tex, ...(note ? { note } : {}) });

/**
 * Resuelve un modelo. Devuelve { ok, model, kendall, metrics, pn, steps, notes, waitTail? }
 * o { ok: false, error } si los datos no son válidos o el sistema es inestable.
 */
export function solve(model, params) {
  try {
    validate(model, params);
  } catch (err) {
    if (err instanceof QueueInputError) return { ok: false, model, error: err.message };
    throw err;
  }
  const r = SOLVERS[model]({ ...params });
  return { ok: !r.error, model, kendall: MODELS[model].kendall, params: { ...params }, ...r };
}

const unstable = (rho, cond) => ({
  error: `El sistema es inestable: ${cond} = ${rho.toFixed(3).replace('.', ',')} ≥ 1. La cola crecería sin límite; hace falta más capacidad de servicio.`,
  rho,
});

const SOLVERS = {
  mm1({ lambda, mu }) {
    const rho = lambda / mu;
    if (rho >= 1) return unstable(rho, 'ρ');
    const P0 = 1 - rho;
    const L = rho / (1 - rho);
    const Lq = (rho * rho) / (1 - rho);
    const W = 1 / (mu - lambda);
    const Wq = rho / (mu - lambda);
    return {
      metrics: { rho, utilization: rho, P0, Pw: rho, lambdaEff: lambda, L, Lq, W, Wq, servers: 1 },
      pn: tail((n) => (1 - rho) * rho ** n),
      waitTail: (t) => ({ Wq: rho * Math.exp(-(mu - lambda) * t), W: Math.exp(-(mu - lambda) * t) }),
      steps: [
        step('Factor de utilización', `\\rho = \\frac{\\lambda}{\\mu} = \\frac{${N_(lambda)}}{${N_(mu)}} = ${N_(rho)} < 1`, 'El sistema es estable.'),
        step('Probabilidad de sistema vacío', `P_0 = 1-\\rho = ${N_(P0)}`),
        step('Clientes en el sistema', `L = \\frac{\\rho}{1-\\rho} = \\frac{${N_(rho)}}{${N_(1 - rho)}} = ${N_(L)}`),
        step('Clientes en cola', `L_q = \\frac{\\rho^2}{1-\\rho} = ${N_(Lq)}`),
        step('Tiempo en el sistema', `W = \\frac{1}{\\mu-\\lambda} = \\frac{1}{${N_(mu)}-${N_(lambda)}} = ${N_(W)}`),
        step('Tiempo en cola', `W_q = \\frac{\\lambda}{\\mu(\\mu-\\lambda)} = ${N_(Wq)}`),
        step('Comprobación (Little)', `L = \\lambda W = ${N_(lambda)} \\cdot ${N_(W)} = ${N_(lambda * W)}`),
      ],
    };
  },

  mmc({ lambda, mu, c }) {
    const a = lambda / mu;
    const rho = a / c;
    if (rho >= 1) return unstable(rho, 'ρ = λ/(cμ)');
    let term = 1;
    let sum = 1;
    for (let n = 1; n < c; n++) {
      term *= a / n;
      sum += term;
    }
    const termC = (term * a) / c; // a^c / c!
    const P0 = 1 / (sum + termC / (1 - rho));
    const Pw = (termC / (1 - rho)) * P0;
    const Lq = (Pw * rho) / (1 - rho);
    const Wq = Lq / lambda;
    const W = Wq + 1 / mu;
    const L = lambda * W;
    const pnAt = (n) => {
      let t = P0;
      for (let i = 1; i <= n; i++) t *= a / Math.min(i, c);
      return t;
    };
    const decay = c * mu * (1 - rho);
    return {
      metrics: { a, rho, utilization: rho, P0, Pw, lambdaEff: lambda, L, Lq, W, Wq, servers: c, idle: c - a },
      pn: tail(pnAt),
      waitTail: (t) => ({ Wq: Pw * Math.exp(-decay * t) }),
      steps: [
        step('Intensidad de tráfico', `a = \\frac{\\lambda}{\\mu} = \\frac{${N_(lambda)}}{${N_(mu)}} = ${N_(a)}`),
        step('Utilización por servidor', `\\rho = \\frac{a}{c} = \\frac{${N_(a)}}{${c}} = ${N_(rho)} < 1`, 'El sistema es estable.'),
        step('Probabilidad de sistema vacío', `P_0 = \\left[\\sum_{n=0}^{c-1}\\frac{a^n}{n!} + \\frac{a^c}{c!\\,(1-\\rho)}\\right]^{-1} = \\left[${N_(sum)} + ${N_(termC / (1 - rho))}\\right]^{-1} = ${N_(P0, 6)}`),
        step('Probabilidad de esperar (Erlang C)', `P_w = \\frac{a^c}{c!\\,(1-\\rho)}\\,P_0 = ${N_(Pw)}`),
        step('Clientes en cola', `L_q = \\frac{P_w\\,\\rho}{1-\\rho} = ${N_(Lq)}`),
        step('Tiempo en cola', `W_q = \\frac{L_q}{\\lambda} = \\frac{${N_(Lq)}}{${N_(lambda)}} = ${N_(Wq, 5)}`),
        step('Tiempo en el sistema', `W = W_q + \\frac{1}{\\mu} = ${N_(Wq, 5)} + ${N_(1 / mu, 5)} = ${N_(W, 5)}`),
        step('Clientes en el sistema', `L = \\lambda W = ${N_(L)}`),
      ],
    };
  },

  mm1k({ lambda, mu, K }) {
    const rho = lambda / mu;
    const pn = birthDeath(K, () => lambda, () => mu);
    const P0 = pn[0];
    const PK = pn[K];
    const L = sumBy(pn, (v, n) => n * v);
    const Lq = L - (1 - P0);
    const lambdaEff = lambda * (1 - PK);
    const W = L / lambdaEff;
    const Wq = Lq / lambdaEff;
    const p0Tex = Math.abs(rho - 1) < 1e-12 ? `P_0 = \\frac{1}{K+1} = \\frac{1}{${K + 1}} = ${N_(P0)}` : `P_0 = \\frac{1-\\rho}{1-\\rho^{K+1}} = \\frac{1-${N_(rho)}}{1-${N_(rho)}^{${K + 1}}} = ${N_(P0)}`;
    return {
      metrics: { rho, utilization: 1 - P0, P0, PK, Pblock: PK, lambdaEff, lost: lambda * PK, L, Lq, W, Wq, servers: 1, capacity: K },
      pn,
      steps: [
        step('Relación de tráfico', `\\rho = \\frac{\\lambda}{\\mu} = ${N_(rho)}`, 'Con capacidad finita el sistema siempre es estable, aunque ρ ≥ 1.'),
        step('Probabilidad de sistema vacío', p0Tex),
        step('Probabilidad de sistema lleno (rechazo)', `P_K = \\rho^{K} P_0 = ${N_(PK, 5)}`),
        step('Tasa efectiva de llegadas', `\\lambda_{ef} = \\lambda\\,(1-P_K) = ${N_(lambda)}\\,(1-${N_(PK, 5)}) = ${N_(lambdaEff)}`),
        step('Clientes en el sistema', `L = \\sum_{n=0}^{K} n\\,P_n = ${N_(L)}`),
        step('Clientes en cola', `L_q = L - (1-P_0) = ${N_(Lq)}`),
        step('Tiempos (Little con λ efectiva)', `W = \\frac{L}{\\lambda_{ef}} = ${N_(W, 5)},\\qquad W_q = \\frac{L_q}{\\lambda_{ef}} = ${N_(Wq, 5)}`),
      ],
    };
  },

  mmck({ lambda, mu, c, K }) {
    const a = lambda / mu;
    const rho = a / c;
    const pn = birthDeath(K, () => lambda, (n) => Math.min(n, c) * mu);
    const P0 = pn[0];
    const PK = pn[K];
    const lambdaEff = lambda * (1 - PK);
    const Lq = sumBy(pn, (v, n) => Math.max(0, n - c) * v);
    const L = Lq + lambdaEff / mu;
    const W = L / lambdaEff;
    const Wq = Lq / lambdaEff;
    const Pw = sumBy(pn, (v, n) => (n >= c && n < K ? v : 0)) / (1 - PK);
    const lossSystem = K === c;
    return {
      metrics: { a, rho, utilization: lambdaEff / (c * mu), P0, PK, Pblock: PK, Pw, lambdaEff, lost: lambda * PK, L, Lq, W, Wq, servers: c, capacity: K },
      pn,
      steps: [
        step('Intensidad de tráfico', `a = \\frac{\\lambda}{\\mu} = ${N_(a)},\\qquad \\rho = \\frac{a}{c} = ${N_(rho)}`),
        step('Probabilidad de sistema vacío', `P_0 = \\left[\\sum_{n=0}^{c}\\frac{a^n}{n!} + \\frac{a^c}{c!}\\sum_{n=c+1}^{K}\\rho^{\\,n-c}\\right]^{-1} = ${N_(P0, 6)}`),
        step(lossSystem ? 'Probabilidad de bloqueo (Erlang B)' : 'Probabilidad de sistema lleno', `P_K = \\frac{a^{K}}{c!\\,c^{K-c}}\\,P_0 = ${N_(PK, 5)}`, lossSystem ? 'Con K = c nadie espera: quien encuentra todo ocupado se pierde.' : undefined),
        step('Tasa efectiva de llegadas', `\\lambda_{ef} = \\lambda\\,(1-P_K) = ${N_(lambdaEff)}`),
        step('Clientes en cola', `L_q = \\sum_{n=c+1}^{K}(n-c)\\,P_n = ${N_(Lq)}`),
        step('Clientes en el sistema', `L = L_q + \\frac{\\lambda_{ef}}{\\mu} = ${N_(L)}`),
        step('Tiempos (Little con λ efectiva)', `W = \\frac{L}{\\lambda_{ef}} = ${N_(W, 5)},\\qquad W_q = \\frac{L_q}{\\lambda_{ef}} = ${N_(Wq, 5)}`),
      ],
    };
  },

  mmcn({ lambda, mu, c, N }) {
    const r = lambda / mu;
    const pn = birthDeath(N, (n) => (N - n) * lambda, (n) => Math.min(n, c) * mu);
    const P0 = pn[0];
    const L = sumBy(pn, (v, n) => n * v);
    const Lq = sumBy(pn, (v, n) => Math.max(0, n - c) * v);
    const lambdaEff = lambda * (N - L);
    const W = L / lambdaEff;
    const Wq = Lq / lambdaEff;
    const busy = L - Lq;
    return {
      metrics: { r, utilization: busy / c, P0, lambdaEff, L, Lq, W, Wq, servers: c, population: N, operating: N - L, busyServers: busy },
      pn,
      steps: [
        step('Relación por cliente', `r = \\frac{\\lambda}{\\mu} = ${N_(r)}`, 'λ es la tasa con que cada cliente (máquina) llega o falla.'),
        step('Probabilidad de sistema vacío', `P_0 = \\left[\\sum_{n=0}^{c-1}\\binom{N}{n} r^n + \\sum_{n=c}^{N}\\frac{N!}{(N-n)!\\,c!\\,c^{\\,n-c}}\\,r^n\\right]^{-1} = ${N_(P0, 6)}`),
        step('Clientes en el sistema', `L = \\sum_{n=0}^{N} n\\,P_n = ${N_(L)}`),
        step('Clientes en cola', `L_q = \\sum_{n=c}^{N}(n-c)\\,P_n = ${N_(Lq)}`),
        step('Tasa efectiva de llegadas', `\\lambda_{ef} = \\lambda\\,(N-L) = ${N_(lambda)}\\,(${N}-${N_(L)}) = ${N_(lambdaEff)}`),
        step('Tiempos (Little con λ efectiva)', `W = \\frac{L}{\\lambda_{ef}} = ${N_(W, 5)},\\qquad W_q = \\frac{L_q}{\\lambda_{ef}} = ${N_(Wq, 5)}`),
        step('Clientes funcionando (fuera del sistema)', `N - L = ${N_(N - L)}`),
      ],
    };
  },

  mg1({ lambda, mu, sigma }) {
    return pollaczek(lambda, mu, sigma * sigma, `\\sigma = ${N_(sigma)}`);
  },
  md1({ lambda, mu }) {
    return pollaczek(lambda, mu, 0, '\\sigma = 0 \\text{ (servicio constante)}');
  },
  mek1({ lambda, mu, k }) {
    return pollaczek(lambda, mu, 1 / (k * mu * mu), `\\sigma^2 = \\frac{1}{k\\mu^2} = \\frac{1}{${k}\\cdot${N_(mu)}^2}`);
  },

  mminf({ lambda, mu }) {
    const a = lambda / mu;
    const P0 = Math.exp(-a);
    return {
      metrics: { a, P0, lambdaEff: lambda, L: a, Lq: 0, W: 1 / mu, Wq: 0, servers: Infinity },
      pn: tail((n) => {
        let t = P0;
        for (let i = 1; i <= n; i++) t *= a / i;
        return t;
      }),
      steps: [
        step('Clientes en el sistema', `L = \\frac{\\lambda}{\\mu} = ${N_(a)}`, 'Siempre hay un servidor libre: nadie espera.'),
        step('Distribución del número de clientes (Poisson)', `P_n = \\frac{e^{-\\lambda/\\mu}(\\lambda/\\mu)^n}{n!},\\qquad P_0 = e^{-${N_(a)}} = ${N_(P0)}`),
        step('Tiempo en el sistema', `W = \\frac{1}{\\mu} = ${N_(1 / mu, 5)},\\qquad L_q = W_q = 0`),
      ],
    };
  },
};

/** Fórmula de Pollaczek-Khinchine (M/G/1 y sus casos particulares). */
function pollaczek(lambda, mu, var_, sigmaTex) {
  const rho = lambda / mu;
  if (rho >= 1) return unstable(rho, 'ρ');
  const Lq = (lambda * lambda * var_ + rho * rho) / (2 * (1 - rho));
  const L = Lq + rho;
  const Wq = Lq / lambda;
  const W = Wq + 1 / mu;
  return {
    metrics: { rho, utilization: rho, P0: 1 - rho, Pw: rho, lambdaEff: lambda, L, Lq, W, Wq, servers: 1, serviceVar: var_ },
    steps: [
      step('Factor de utilización', `\\rho = \\frac{\\lambda}{\\mu} = \\frac{${N_(lambda)}}{${N_(mu)}} = ${N_(rho)} < 1`),
      step('Variabilidad del servicio', sigmaTex),
      step('Clientes en cola (Pollaczek-Khinchine)', `L_q = \\frac{\\lambda^2\\sigma^2 + \\rho^2}{2(1-\\rho)} = \\frac{${N_(lambda * lambda * var_)} + ${N_(rho * rho)}}{2(1-${N_(rho)})} = ${N_(Lq)}`),
      step('Clientes en el sistema', `L = L_q + \\rho = ${N_(L)}`),
      step('Tiempos (Little)', `W_q = \\frac{L_q}{\\lambda} = ${N_(Wq, 5)},\\qquad W = W_q + \\frac{1}{\\mu} = ${N_(W, 5)}`),
      step('Probabilidad de sistema vacío', `P_0 = 1-\\rho = ${N_(1 - rho)}`),
    ],
  };
}

/** Modelos donde tiene sentido variar el número de servidores. */
export const MULTI_SERVER = new Set(['mmc', 'mmck', 'mmcn']);

/**
 * Costo total por unidad de tiempo: Cs·c + Cw·(Lq o L), más el costo de los clientes
 * rechazados si se indica Cr (modelos con capacidad).
 */
export function totalCost(res, { cs = 0, cw = 0, base = 'Lq', cr = 0 }) {
  const m = res.metrics;
  const servers = Number.isFinite(m.servers) ? m.servers : 0;
  const service = cs * servers;
  const waiting = cw * (base === 'L' ? m.L : m.Lq);
  const lost = cr * (m.lost ?? 0);
  return { service, waiting, lost, total: service + waiting + lost };
}

/**
 * Recorre c = cMin..cMax y elige el de menor costo que cumpla las restricciones
 * opcionales (Wq máximo, probabilidad de bloqueo máxima).
 */
export function optimizeServers(model, params, costs, { cMin = 1, cMax = 30, maxWq = null, maxBlock = null } = {}) {
  const rows = [];
  for (let c = cMin; c <= cMax; c++) {
    const p = { ...params, c, ...(model === 'mmck' ? { K: Math.max(params.K, c) } : {}) };
    const res = solve(model, p);
    if (!res.ok) {
      rows.push({ c, ok: false, reason: res.error });
      continue;
    }
    const cost = totalCost(res, costs);
    const feasible = (maxWq == null || res.metrics.Wq <= maxWq) && (maxBlock == null || (res.metrics.Pblock ?? 0) <= maxBlock);
    rows.push({ c, ok: true, feasible, metrics: res.metrics, cost });
  }
  const candidates = rows.filter((r) => r.ok && r.feasible);
  const best = candidates.length ? candidates.reduce((a, b) => (b.cost.total < a.cost.total ? b : a)) : null;
  return { rows, best };
}
