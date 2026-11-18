import { describe, it, expect } from 'vitest';
import katex from 'katex';
import { PARAMS } from '../src/config.js';
import { optimize } from '../src/lib/queue.js';
import { buildSteps, buildModelRows, tex, latexToText } from '../src/lib/formulas.js';

const OPTS = { output: 'html', trust: (c) => c.command === '\htmlClass', strict: 'ignore', throwOnError: true, displayMode: true };

describe('fórmulas KaTeX', () => {
  it('todas las expresiones se renderizan sin error para cada x factible', () => {
    const opt = optimize(PARAMS);
    const sources = buildModelRows(PARAMS, opt).map((r) => r[1]);
    for (const s of opt.feasible) {
      for (const step of buildSteps(PARAMS, opt, s.c)) sources.push(step.formula, step.value);
    }
    for (const src of sources) expect(() => katex.renderToString(src, OPTS), src).not.toThrow();
  });

  it('el resultado nunca contiene LaTeX crudo ni errores de KaTeX', () => {
    const opt = optimize(PARAMS);
    for (const s of opt.feasible) {
      for (const step of buildSteps(PARAMS, opt, s.c)) {
        const html = tex(step.value);
        expect(html).not.toContain('katex-error');
        expect(html).not.toContain('math-fallback');
      }
    }
  });

  it('el respaldo en texto no muestra comandos LaTeX', () => {
    const html = tex('\frac{a}{b} \badcommand{x}');
    expect(html).toContain('math-fallback');
    expect(html).not.toMatch(/\[a-zA-Z]/);
    expect(latexToText(String.raw`\rho = \frac{12}{15} = \htmlClass{fx-result}{0{,}80}`)).toBe('ρ = (12)/(15) = 0,80');
  });
});
