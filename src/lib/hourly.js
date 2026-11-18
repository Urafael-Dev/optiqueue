import { mmc, optimize } from './queue.js';

/**
 * Perfil ilustrativo de llegadas internacionales (pasajeros/hora) para las 24 horas.
 * El pico (180 pas/h) coincide con la λ del enunciado; el resto es un supuesto
 * típico de aeropuerto con dos olas de vuelos (mañana y tarde-noche).
 */
export const DEMAND_PROFILE = Object.freeze([
  40, 30, 25, 20, 35, 70, 120, 160, 180, 170, 140, 120,
  110, 115, 125, 135, 150, 165, 180, 175, 155, 130, 95, 60,
]);

const WIDE = { xMin: 1, xMax: 60 };

/**
 * Dimensionamiento hora a hora (método SIPP: cada franja se trata como un M/M/c
 * estacionario independiente) frente a mantener un número fijo de ventanillas.
 */
export function hourlyPlan(P, profile = DEMAND_PROFILE, { scale = 1, fixed = [15, 16] } = {}) {
  const rows = profile.map((base, h) => {
    const lambda = Math.round(base * scale);
    const params = { ...P, lambda, ...WIDE };
    const opt = optimize(params);
    const best = opt.status === 'Optimal' ? opt.best : null;
    const fixedRes = fixed.map((c) => mmc(c, params));
    return { h, lambda, x: best?.c ?? null, best, fixed: fixedRes };
  });

  const sum = (f) => rows.reduce((acc, r) => acc + f(r), 0);
  const dynamic = {
    cost: sum((r) => r.best?.totalCost ?? Infinity),
    windowHours: sum((r) => r.x ?? 0),
    feasible: rows.every((r) => r.best),
  };
  const fixedTotals = fixed.map((c, i) => ({
    c,
    cost: sum((r) => r.fixed[i].totalCost),
    windowHours: c * rows.length,
    slaBreaches: rows.filter((r) => !r.fixed[i].meetsSla).length,
  }));
  const maxX = Math.max(...rows.map((r) => r.x ?? 0));
  const peak = rows.reduce((m, r) => (r.lambda > m.lambda ? r : m));

  return { rows, dynamic, fixed: fixedTotals, maxX, peak, scale };
}
