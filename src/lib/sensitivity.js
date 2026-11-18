import { mmc, optimize } from './queue.js';

/** Rango amplio de x para que el óptimo nunca quede fuera por los límites de la tabla. */
const WIDE = { xMin: 1, xMax: 80 };

/**
 * Parámetros que se pueden variar. `get`/`set` traducen entre el valor que ve el
 * usuario (p. ej. minutos) y el parámetro del modelo (horas).
 */
export const SENS_PARAMS = [
  { key: 'mu', sym: 'μ', label: 'Velocidad de atención', unit: 'pas/h', min: 10, max: 24, step: 0.5, decimals: 1,
    get: (P) => P.mu, set: (v) => ({ mu: v }) },
  { key: 'cw', sym: 'Cw', label: 'Costo de espera', unit: 'USD/h', min: 5, max: 160, step: 1, decimals: 0, money: true,
    get: (P) => P.cw, set: (v) => ({ cw: v }) },
  { key: 'cs', sym: 'Cs', label: 'Costo de ventanilla', unit: 'USD/h', min: 10, max: 150, step: 1, decimals: 0, money: true,
    get: (P) => P.cs, set: (v) => ({ cs: v }) },
  { key: 'wq', sym: 'Wq máx', label: 'Espera máxima', unit: 'min', min: 0.25, max: 10, step: 0.25, decimals: 2,
    get: (P) => P.wqMaxH * 60, set: (v) => ({ wqMaxH: v / 60 }) },
  { key: 'lambda', sym: 'λ', label: 'Demanda', unit: 'pas/h', min: 100, max: 300, step: 5, decimals: 0,
    get: (P) => P.lambda, set: (v) => ({ lambda: v }) },
];

export const paramDef = (key) => SENS_PARAMS.find((d) => d.key === key);

/** Óptimo con un parámetro cambiado. */
export function solveWith(P, def, value) {
  const params = { ...P, ...def.set(value), ...WIDE };
  const opt = optimize(params);
  return { value, params, opt, x: opt.status === 'Optimal' ? opt.x : null };
}

/** x* para una rejilla de valores del parámetro. */
export function sweep(P, def, points = 120) {
  const out = [];
  for (let i = 0; i <= points; i++) {
    const v = def.min + ((def.max - def.min) * i) / points;
    out.push({ v, x: solveWith(P, def, v).x });
  }
  return out;
}

/**
 * Intervalo del parámetro en el que la solución base x0 sigue siendo óptima
 * (x*(v) es monótona en cada parámetro, así que es un intervalo). Se buscan
 * los extremos por bisección dentro de [min, max] del parámetro.
 */
export function optimalityRange(P, def, x0) {
  const base = def.get(P);
  const xAt = (v) => solveWith(P, def, v).x;
  const edge = (from, to) => {
    if (xAt(to) === x0) return { value: null, x: null }; // no cambia dentro del rango estudiado
    let ok = from;
    let bad = to;
    for (let i = 0; i < 50; i++) {
      const mid = (ok + bad) / 2;
      if (xAt(mid) === x0) ok = mid;
      else bad = mid;
    }
    return { value: ok, x: xAt(bad) };
  };
  return { base, x0, low: edge(base, def.min), high: edge(base, def.max) };
}

/** Variación ±pct de cada parámetro: nuevo óptimo y costo de no ajustar x. */
export function tornado(P, x0, pct = 0.2) {
  return SENS_PARAMS.map((def) => {
    const base = def.get(P);
    const row = (v) => {
      const s = solveWith(P, def, v);
      const keep = mmc(x0, s.params);
      return {
        value: v,
        x: s.x,
        y: s.opt.y ?? Infinity,
        keepCost: keep.stable ? keep.totalCost : Infinity,
        keepOk: keep.stable && keep.meetsSla,
      };
    };
    return { def, base, down: row(base * (1 - pct)), up: row(base * (1 + pct)) };
  });
}
