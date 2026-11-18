import { describe, it, expect } from 'vitest';
import { PARAMS as P } from '../src/config.js';
import { mmc } from '../src/lib/queue.js';
import { optimalityRange, paramDef, solveWith, tornado } from '../src/lib/sensitivity.js';
import { DEMAND_PROFILE, hourlyPlan } from '../src/lib/hourly.js';

describe('análisis de sensibilidad', () => {
  it('con los parámetros base el óptimo sigue siendo 15', () => {
    for (const key of ['mu', 'cw', 'cs', 'wq', 'lambda']) {
      const def = paramDef(key);
      expect(solveWith(P, def, def.get(P)).x).toBe(15);
    }
  });

  it('el rango de Cw coincide con el análisis marginal exacto', () => {
    const lq = (c) => mmc(c, P).Lq;
    const toward16 = P.cs / (lq(15) - lq(16)); // por encima conviene 16
    const toward14 = P.cs / (lq(14) - lq(15)); // por debajo conviene 14
    const r = optimalityRange(P, paramDef('cw'), 15);
    expect(r.high.value).toBeCloseTo(toward16, 6);
    expect(r.high.x).toBe(16);
    expect(r.low.value).toBeCloseTo(toward14, 6);
    expect(r.low.x).toBe(14);
  });

  it('el límite de espera solo cambia el óptimo si baja de Wq(15)', () => {
    const r = optimalityRange(P, paramDef('wq'), 15);
    expect(r.low.value).toBeCloseTo(mmc(15, P).Wq * 60, 6);
    expect(r.high.value).toBeNull();
  });

  it('±20 % produce óptimos coherentes en dirección', () => {
    const t = Object.fromEntries(tornado(P, 15).map((r) => [r.def.key, r]));
    expect(t.mu.up.x).toBeLessThan(15);
    expect(t.mu.down.x).toBeGreaterThan(15);
    expect(t.lambda.up.x).toBeGreaterThan(15);
    expect(t.lambda.down.x).toBeLessThan(15);
  });
});

describe('demanda por hora', () => {
  it('en la hora pico coincide con el enunciado', () => {
    const plan = hourlyPlan(P);
    expect(plan.peak.lambda).toBe(P.lambda);
    expect(plan.rows[plan.peak.h].x).toBe(15);
    expect(plan.maxX).toBe(15);
  });

  it('el plan dinámico cuesta menos que dejar 15 fijas y cumple el límite', () => {
    const plan = hourlyPlan(P);
    expect(plan.dynamic.feasible).toBe(true);
    expect(plan.dynamic.cost).toBeLessThan(plan.fixed[0].cost);
    expect(plan.rows.every((r) => r.best.Wq <= P.wqMaxH)).toBe(true);
    expect(plan.rows).toHaveLength(DEMAND_PROFILE.length);
  });
});
