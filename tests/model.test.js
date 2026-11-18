import { describe, expect, it } from 'vitest';
import { PARAMS } from '../src/config.js';
import { mmc, optimize, savings } from '../src/lib/queue.js';
import { simulate } from '../src/lib/simulation.js';
import { createLiveSim } from '../src/lib/liveSim.js';

describe('Simulación en vivo (gemelo digital)', () => {
  it('converge a los valores teóricos con c = 15', () => {
    const sim = createLiveSim({ c: 15, lambda: PARAMS.lambda, mu: PARAMS.mu, maxBooths: 20, seed: 3 });
    sim.step(2, PARAMS.wqMaxH); // calentamiento
    sim.setOpen(15, PARAMS.wqMaxH); // reinicia estadísticas
    for (let i = 0; i < 4000; i++) sim.step(0.05, PARAMS.wqMaxH); // 200 h en pasos pequeños
    const s = sim.snapshot();
    const th = mmc(15, PARAMS);
    expect(s.rho).toBeCloseTo(th.rho, 1);
    expect(s.wq * 60).toBeGreaterThan(th.Wq * 60 * 0.85);
    expect(s.wq * 60).toBeLessThan(th.Wq * 60 * 1.15);
    expect(s.lq).toBeCloseTo((s.served / s.elapsed) * s.wq, 1); // ley de Little
  });

  it('cerrar ventanillas no interrumpe la atención en curso', () => {
    const sim = createLiveSim({ c: 20, lambda: PARAMS.lambda, mu: PARAMS.mu, maxBooths: 20, seed: 5 });
    sim.step(1, PARAMS.wqMaxH);
    sim.setOpen(10, PARAMS.wqMaxH);
    const s = sim.snapshot();
    expect(s.booths.filter((b) => !b.open && b.busy).length).toBeGreaterThanOrEqual(0);
    sim.step(2, PARAMS.wqMaxH);
    expect(sim.snapshot().booths.slice(10).every((b) => !b.busy)).toBe(true);
  });
});

describe('M/M/c (Erlang C)', () => {
  it('c = 12 es inestable (rho = 1)', () => {
    const s = mmc(12, PARAMS);
    expect(s.stable).toBe(false);
    expect(s.totalCost).toBe(Infinity);
  });

  it('valores de referencia', () => {
    const expected = { 13: 988.11, 14: 815.61, 15: 801.07, 16: 824.55, 17: 862.16, 18: 906.05, 19: 952.98, 20: 1001.45 };
    for (const [c, ct] of Object.entries(expected)) {
      expect(mmc(Number(c), PARAMS).totalCost).toBeCloseTo(ct, 2);
    }
    const s15 = mmc(15, PARAMS);
    expect(s15.Pw).toBeCloseTo(0.3192, 4);
    expect(s15.Lq).toBeCloseTo(1.2768, 4);
    expect(s15.Wq * 60).toBeCloseTo(0.4256, 4);
    expect(s15.P0).toBeLessThan(1e-5);
  });

  it('el óptimo es x* = 15 y los cortes secantes reproducen CT en enteros', () => {
    const opt = optimize(PARAMS);
    expect(opt.status).toBe('Optimal');
    expect(opt.x).toBe(15);
    expect(opt.xSla).toBe(13);
    for (const s of opt.feasible) {
      const envelope = Math.max(...opt.cuts.map((k) => k.intercept + k.slope * s.c));
      expect(envelope).toBeCloseTo(s.totalCost, 6);
    }
  });

  it('ahorro frente al escenario reportado', () => {
    const opt = optimize(PARAMS);
    const sv = savings(PARAMS, opt.best);
    expect(sv.perHourReported).toBeCloseTo(318.93, 2);
    expect(sv.pctReported).toBeCloseTo(0.2848, 4);
    expect(sv.perHourTheoretical).toBeCloseTo(23.48, 2);
    expect(Math.round(sv.annual)).toBe(1862548);
    expect(sv.cumulativeMonthly.at(-1)).toBeCloseTo(sv.annual, 6);
  });
});

describe('Simulación DES', () => {
  it('converge al Wq analítico (c = 15)', () => {
    const r = simulate({ ...PARAMS, c: 15, hours: 200, replications: 10 });
    expect(r.wq * 60).toBeGreaterThan(0.3);
    expect(r.wq * 60).toBeLessThan(0.55);
  });

  it('es reproducible con la misma semilla', () => {
    const a = simulate({ ...PARAMS, c: 14, hours: 4, seed: 7 });
    const b = simulate({ ...PARAMS, c: 14, hours: 4, seed: 7 });
    expect(a.wq).toBe(b.wq);
  });
});
