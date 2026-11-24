import { MODELS, MULTI_SERVER, optimizeServers, solve, totalCost } from './models.js';

/**
 * Un «ejercicio» del resolvedor: modelo, datos, costos y restricciones.
 * Lo usan la página del resolvedor y el asistente, así ambos dan exactamente lo mismo.
 *
 * spec = {
 *   modelo: 'mmc', unidad: 'hora',
 *   lambda, mu, c, K, N, sigma, k,              // tasas en la unidad elegida
 *   cs, cw, base: 'Lq' | 'L', cr,               // costos opcionales (por unidad de tiempo)
 *   optimizar, cMin, cMax, maxWq, maxBlock,     // optimización del número de servidores
 * }
 */
export const UNITS = {
  hora: { label: 'hora', plural: 'horas', short: 'h', toMin: 60 },
  minuto: { label: 'minuto', plural: 'minutos', short: 'min', toMin: 1 },
  dia: { label: 'día', plural: 'días', short: 'día', toMin: 1440 },
  semana: { label: 'semana', plural: 'semanas', short: 'sem', toMin: 10080 },
};

const NUM_KEYS = ['lambda', 'mu', 'c', 'K', 'N', 'sigma', 'k', 'cs', 'cw', 'cr', 'cMin', 'cMax', 'maxWq', 'maxBlock'];

export function paramsOf(spec) {
  const out = {};
  for (const f of MODELS[spec.modelo]?.fields ?? []) out[f] = spec[f];
  return out;
}

const hasCosts = (s) => (s.cs ?? 0) > 0 || (s.cw ?? 0) > 0 || (s.cr ?? 0) > 0;

/** Resuelve el ejercicio completo: modelo, costos y (si se pide) el mejor número de servidores. */
export function runSpec(spec) {
  const res = solve(spec.modelo, paramsOf(spec));
  const costs = { cs: spec.cs ?? 0, cw: spec.cw ?? 0, base: spec.base === 'L' ? 'L' : 'Lq', cr: spec.cr ?? 0 };
  const out = { spec, res, costs: hasCosts(spec) ? costs : null };
  if (res.ok && out.costs) out.cost = totalCost(res, costs);
  if (spec.optimizar && MULTI_SERVER.has(spec.modelo)) {
    const minStable = spec.modelo === 'mmc' ? Math.floor(spec.lambda / spec.mu) + 1 : 1;
    const cMin = Math.max(1, spec.cMin ?? minStable);
    const cMax = Math.min(200, Math.max(cMin, spec.cMax ?? cMin + 10));
    out.optimization = optimizeServers(spec.modelo, paramsOf(spec), costs, { cMin, cMax, maxWq: spec.maxWq ?? null, maxBlock: spec.maxBlock ?? null });
  }
  return out;
}

// ---------- URL (para compartir un ejercicio o abrirlo desde el asistente) ----------
export function specToHash(spec) {
  const q = new URLSearchParams();
  q.set('m', spec.modelo);
  if (spec.unidad) q.set('u', spec.unidad);
  for (const k of NUM_KEYS) if (Number.isFinite(spec[k])) q.set(k, String(spec[k]));
  if (spec.base) q.set('base', spec.base);
  if (spec.optimizar) q.set('opt', '1');
  if (spec.titulo) q.set('t', spec.titulo);
  return `#${q.toString()}`;
}

export function hashToSpec(hash) {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const modelo = q.get('m');
  if (!modelo || !MODELS[modelo]) return null;
  const spec = { modelo, unidad: UNITS[q.get('u')] ? q.get('u') : 'hora' };
  for (const k of NUM_KEYS) {
    const v = q.get(k);
    if (v != null && v !== '' && Number.isFinite(Number(v))) spec[k] = Number(v);
  }
  if (q.get('base') === 'L') spec.base = 'L';
  if (q.get('opt') === '1') spec.optimizar = true;
  if (q.get('t')) spec.titulo = q.get('t').slice(0, 80);
  return spec;
}

// ---------- Resumen compacto (lo que recibe el asistente) ----------
const r = (v, d = 4) => (Number.isFinite(v) ? Number(v.toFixed(d)) : v === Infinity ? 'infinito' : null);

export function summarize(run) {
  const { spec, res } = run;
  const u = UNITS[spec.unidad] ?? UNITS.hora;
  if (!res.ok) return { ok: false, modelo: MODELS[spec.modelo]?.kendall, error: res.error };
  const m = res.metrics;
  const time = (v) => ({ [u.plural]: r(v, 5), minutos: r(v * u.toMin, 3) });
  const out = {
    ok: true,
    modelo: res.kendall,
    unidad_de_tiempo: u.label,
    datos: paramsOf(spec),
    resultados: {
      ...(m.rho != null ? { rho: r(m.rho) } : {}),
      ...(m.utilization != null ? { utilizacion_servidores: r(m.utilization) } : {}),
      P0: r(m.P0, 6),
      ...(m.Pw != null ? { prob_esperar: r(m.Pw) } : {}),
      ...(m.Pblock != null ? { prob_bloqueo_PK: r(m.Pblock, 6), clientes_perdidos_por_unidad: r(m.lost) } : {}),
      lambda_efectiva: r(m.lambdaEff),
      L: r(m.L),
      Lq: r(m.Lq),
      W: time(m.W),
      Wq: time(m.Wq),
      ...(m.operating != null ? { clientes_funcionando: r(m.operating) } : {}),
    },
    Pn_primeros: (res.pn ?? []).slice(0, 8).map((v, n) => ({ n, Pn: r(v, 5) })),
  };
  if (run.cost) out.costo = { servicio: r(run.cost.service, 2), espera: r(run.cost.waiting, 2), rechazo: r(run.cost.lost, 2), total: r(run.cost.total, 2), por: u.label };
  if (run.optimization) {
    const o = run.optimization;
    out.optimizacion = o.best
      ? { mejor_c: o.best.c, costo_total: r(o.best.cost.total, 2), tabla: o.rows.filter((x) => x.ok).map((x) => ({ c: x.c, costo: r(x.cost.total, 2), Wq_min: r(x.metrics.Wq * u.toMin, 3), cumple: x.feasible })) }
      : { mejor_c: null, detalle: 'Ningún número de servidores del rango cumple las restricciones.' };
  }
  return out;
}
