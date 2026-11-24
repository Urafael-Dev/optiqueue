import { describe, expect, it } from 'vitest';
import { PARAMS } from '../src/config.js';
import { mmc } from '../src/lib/queue.js';
import { optimizeServers, solve, texNum } from '../src/lib/models.js';

const m = (model, p) => {
  const r = solve(model, p);
  expect(r.ok, r.error).toBe(true);
  return r.metrics;
};

describe('Resolvedor general de colas', () => {
  it('M/M/1 (λ = 2, μ = 3): valores de libro', () => {
    const r = m('mm1', { lambda: 2, mu: 3 });
    expect(r.rho).toBeCloseTo(2 / 3, 6);
    expect(r.L).toBeCloseTo(2, 6);
    expect(r.Lq).toBeCloseTo(4 / 3, 6);
    expect(r.W).toBeCloseTo(1, 6);
    expect(r.Wq).toBeCloseTo(2 / 3, 6);
  });

  it('M/M/2 (λ = 2, μ = 3): P0 = 0,5 y Lq = 1/12', () => {
    const r = m('mmc', { lambda: 2, mu: 3, c: 2 });
    expect(r.P0).toBeCloseTo(0.5, 6);
    expect(r.Lq).toBeCloseTo(1 / 12, 6);
    expect(r.L).toBeCloseTo(0.75, 6);
  });

  it('M/M/c coincide con el modelo del proyecto (15 ventanillas)', () => {
    const r = m('mmc', { lambda: PARAMS.lambda, mu: PARAMS.mu, c: 15 });
    const ref = mmc(15, PARAMS);
    expect(r.Lq).toBeCloseTo(ref.Lq, 9);
    expect(r.Wq).toBeCloseTo(ref.Wq, 9);
  });

  it('M/M/1/K: ρ = 1 reparte la probabilidad por igual y ρ ≠ 1 sigue la fórmula cerrada', () => {
    const eq = m('mm1k', { lambda: 1, mu: 1, K: 3 });
    expect(eq.P0).toBeCloseTo(0.25, 9);
    expect(eq.L).toBeCloseTo(1.5, 9);
    const r = m('mm1k', { lambda: 2, mu: 3, K: 3 });
    const rho = 2 / 3;
    expect(r.P0).toBeCloseTo((1 - rho) / (1 - rho ** 4), 9);
    expect(r.L).toBeCloseTo(rho / (1 - rho) - (4 * rho ** 4) / (1 - rho ** 4), 9);
    expect(r.W).toBeCloseTo(r.L / r.lambdaEff, 9);
  });

  it('M/M/c/c es Erlang B y M/M/c/K con K grande tiende a M/M/c', () => {
    const b = m('mmck', { lambda: 2, mu: 1, c: 2, K: 2 });
    expect(b.Pblock).toBeCloseTo(0.4, 9);
    expect(b.Lq).toBe(0);
    const big = m('mmck', { lambda: 2, mu: 3, c: 2, K: 400 });
    expect(big.Lq).toBeCloseTo(1 / 12, 6);
  });

  it('Población finita: con N = 1 el tiempo en el sistema es 1/μ', () => {
    const r = m('mmcn', { lambda: 1, mu: 2, c: 1, N: 1 });
    expect(r.P0).toBeCloseTo(2 / 3, 9);
    expect(r.L).toBeCloseTo(1 / 3, 9);
    expect(r.W).toBeCloseTo(0.5, 9);
  });

  it('M/G/1 con σ = 1/μ y M/Eₖ/1 con k = 1 equivalen a M/M/1; M/D/1 espera la mitad', () => {
    const base = m('mm1', { lambda: 2, mu: 3 });
    expect(m('mg1', { lambda: 2, mu: 3, sigma: 1 / 3 }).Lq).toBeCloseTo(base.Lq, 9);
    expect(m('mek1', { lambda: 2, mu: 3, k: 1 }).Lq).toBeCloseTo(base.Lq, 9);
    expect(m('md1', { lambda: 2, mu: 3 }).Lq).toBeCloseTo(base.Lq / 2, 9);
  });

  it('M/M/∞: L = λ/μ y nadie espera', () => {
    const r = m('mminf', { lambda: 6, mu: 2 });
    expect(r.L).toBeCloseTo(3, 9);
    expect(r.Wq).toBe(0);
  });

  it('Detecta sistemas inestables y datos inválidos', () => {
    expect(solve('mm1', { lambda: 3, mu: 3 }).ok).toBe(false);
    expect(solve('mmc', { lambda: 10, mu: 2, c: 4 }).error).toMatch(/inestable/);
    expect(solve('mmck', { lambda: 1, mu: 1, c: 3, K: 2 }).error).toMatch(/capacidad/);
    expect(solve('mmc', { lambda: 1, mu: 1, c: 1.5 }).error).toMatch(/entero/);
  });

  it('La distribución Pn suma 1', () => {
    for (const [model, p] of [['mm1', { lambda: 2, mu: 3 }], ['mmc', { lambda: 5, mu: 2, c: 3 }], ['mmck', { lambda: 5, mu: 2, c: 2, K: 6 }], ['mmcn', { lambda: 0.1, mu: 0.5, c: 2, N: 10 }]]) {
      const pn = solve(model, p).pn;
      expect(pn.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
    }
  });

  it('Optimizar servidores reproduce el óptimo del proyecto (15 ventanillas, $801,07/h)', () => {
    const { best } = optimizeServers('mmc', { lambda: PARAMS.lambda, mu: PARAMS.mu }, { cs: PARAMS.cs, cw: PARAMS.cw, base: 'Lq' }, { cMin: 12, cMax: 20, maxWq: PARAMS.wqMaxH });
    expect(best.c).toBe(15);
    expect(best.cost.total).toBeCloseTo(801.07, 2);
  });

  it('Formatea números para LaTeX con coma decimal', () => {
    expect(texNum(1234.5)).toBe('1\\,234{,}5');
    expect(texNum(0.25)).toBe('0{,}25');
  });
});
