import katex from 'katex';
import { mmc } from './queue.js';
import { num, usd } from './format.js';

/** Número con coma decimal apta para KaTeX (la coma va entre llaves para no añadir espacio). */
const n = (v, d) => num(v, d).replace(',', '{,}').replace(/\./g, '\\,');
/** Marca el resultado final de una expresión para resaltarlo al revelarse. */
const R = (s) => `\\htmlClass{fx-result}{${s}}`;

const KATEX_OPTS = {
  output: 'html',
  trust: (ctx) => ctx.command === '\\htmlClass',
  strict: 'ignore',
};

const SYMBOLS = {
  lambda: 'λ', mu: 'μ', rho: 'ρ', sum: 'Σ', le: '≤', ge: '≥', leq: '≤', geq: '≥', cdot: '·',
  times: '×', infty: '∞', dots: '…', ldots: '…', Longleftrightarrow: '⇔', in: '∈',
};

/**
 * Versión legible en texto plano de una expresión LaTeX. Solo se usa si KaTeX
 * no pudiera renderizarla, para no mostrar nunca código LaTeX crudo.
 */
export function latexToText(src) {
  let s = src;
  let prev;
  do {
    prev = s;
    s = s
      .replace(/\\htmlClass\{[^{}]*\}\{((?:[^{}]|\{[^{}]*\})*)\}/g, '$1')
      .replace(/\\frac\{((?:[^{}]|\{[^{}]*\})*)\}\{((?:[^{}]|\{[^{}]*\})*)\}/g, '($1)/($2)')
      .replace(/\\(?:text|mathrm|operatorname)\{([^{}]*)\}/g, '$1')
      .replace(/\\mathbb\{Z\}/g, 'ℤ');
  } while (s !== prev);
  return s
    .replace(/\\begin\{[^}]*\}|\\end\{[^}]*\}/g, '')
    .replace(/\\\\(\[[^\]]*\])?/g, '\n')
    .replace(/\\(left|right)/g, '')
    .replace(/\\([A-Za-z]+)/g, (m, name) => SYMBOLS[name] ?? (name.length > 1 ? ' ' : name))
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/[&{}]/g, '')
    .replace(/\^\s*(-?\d+|\w)/g, '^$1')
    .replace(/_\s*(\w)/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

const escapeHtml = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Renderiza LaTeX; si falla, devuelve un respaldo en texto legible (nunca el código fuente). */
export function tex(src, display = true) {
  try {
    return katex.renderToString(src, { ...KATEX_OPTS, displayMode: display, throwOnError: true });
  } catch (err) {
    if (typeof console !== 'undefined') console.warn('[KaTeX]', err.message, src);
    const text = escapeHtml(latexToText(src)).replace(/\n/g, '<br>');
    return `<span class="math-fallback">${text}</span>`;
  }
}

/** Pasos del desarrollo para un número de ventanillas x. */
export function buildSteps(P, opt, x) {
  const m = mmc(x, P);
  const a = P.lambda / P.mu;
  const [mant, exp] = m.P0.toExponential(3).split('e');
  const p0Tex = `${mant.replace('.', '{,}')} \\times 10^{${Number(exp)}}`;
  const diff = m.totalCost - opt.best.totalCost;

  return [
    {
      title: 'Intensidad de tráfico y utilización',
      formula: String.raw`\begin{aligned} a &= \frac{\lambda}{\mu} \\[8pt] \rho &= \frac{a}{x} < 1 \end{aligned}`,
      value: String.raw`\begin{aligned} a &= \frac{${P.lambda}}{${P.mu}} = ${n(a, 0)} \\[8pt] \rho &= \frac{${n(a, 0)}}{${x}} = ${R(n(m.rho, 2))} \end{aligned}`,
      note: `El sistema solo es estable si ρ < 1, es decir con x ≥ ${opt.xSla} ventanillas. Con ${x}, cada ventanilla está ocupada el ${num(m.rho * 100, 0)} % del tiempo.`,
    },
    {
      title: 'Probabilidad de sistema vacío',
      formula: String.raw`P_0 = \left[\sum_{n=0}^{x-1} \frac{a^n}{n!} + \frac{a^x}{x!\,(1-\rho)}\right]^{-1}`,
      value: String.raw`P_0 = ${R(p0Tex)}`,
      note: `Con ${num(a, 0)} erlangs de carga es casi imposible que todas las ventanillas estén libres a la vez.`,
    },
    {
      title: 'Probabilidad de esperar (Erlang C)',
      formula: String.raw`P_w = \frac{a^x}{x!\,(1-\rho)}\, P_0`,
      value: String.raw`P_w = ${R(n(m.Pw, 4))}`,
      note: `Aproximadamente ${num(m.Pw * 100, 0)} de cada 100 pasajeros encuentran todas las ventanillas ocupadas y deben hacer cola.`,
    },
    {
      title: 'Longitud de la cola y espera (ley de Little)',
      formula: String.raw`\begin{aligned} L_q &= P_w \,\frac{\rho}{1-\rho} \\[8pt] W_q &= \frac{L_q}{\lambda} \end{aligned}`,
      value: String.raw`\begin{aligned} L_q &= ${n(m.Pw, 4)} \cdot \frac{${n(m.rho, 2)}}{${n(1 - m.rho, 2)}} = ${n(m.Lq, 3)} \\[8pt] W_q &= \frac{${n(m.Lq, 3)}}{${P.lambda}} = ${n(m.Wq, 5)}\ \text{h} \\[8pt] &= ${R(`${n(m.Wq * 60, 3)}\\ \\text{min}`)} \end{aligned}`,
      note: m.meetsSla
        ? `Cumple el nivel de servicio: ${num(m.Wq * 60, 3)} min ≤ ${num(P.wqMaxH * 60, 0)} min.`
        : `No cumple el nivel de servicio: ${num(m.Wq * 60, 2)} min > ${num(P.wqMaxH * 60, 0)} min.`,
    },
    {
      title: 'Costo total por hora',
      formula: String.raw`CT(x) = C_s\, x + C_w\, L_q(x)`,
      value: String.raw`\begin{aligned} CT(${x}) &= ${P.cs} \cdot ${x} + ${P.cw} \cdot ${n(m.Lq, 3)} \\[8pt] &= ${R(`${n(m.totalCost, 2)}\\ \\text{USD/h}`)} \end{aligned}`,
      note:
        diff === 0
          ? `Es el menor costo posible: x = ${x} es el óptimo.`
          : `Son ${usd(diff)}/h más que el óptimo (x* = ${opt.x}, ${usd(opt.best.totalCost)}/h).`,
    },
  ];
}

/** Filas del modelo de programación entera: [etiqueta, LaTeX, explicación]. */
export function buildModelRows(P, opt) {
  const b = opt.best;
  const cutsFrom = opt.feasible[0].c;
  const cutsTo = opt.feasible.at(-1).c - 1;
  return [
    ['Objetivo', String.raw`\min_{x,\,y}\; y`, 'Minimizar el costo total por hora.'],
    ['Costo', String.raw`\begin{aligned} y &\ge CT(k) + [\,CT(k+1) - CT(k)\,]\,(x - k) \\[2pt] k &= ${cutsFrom}, \dots, ${cutsTo} \end{aligned}`, 'Secantes de la curva convexa: en los enteros obligan a que y = CT(x).'],
    ['Servicio', String.raw`W_q(x) \le ${n(P.wqMaxH, 1)}\ \text{h} \;\Longleftrightarrow\; x \ge ${opt.xSla}`, 'Como la espera baja al abrir ventanillas, el límite se traduce en un mínimo de x.'],
    ['Dominio', String.raw`x \in \mathbb{Z}, \quad ${cutsFrom} \le x \le ${P.xMax}, \quad y \ge 0`, 'x es entera: no se puede abrir media ventanilla.'],
    ['Solución', String.raw`x^* = ${R(String(b.c))}, \qquad y^* = ${R(`${n(b.totalCost, 2)}\\ \\text{USD/h}`)}`, 'Lo que devuelve PuLP con el solver CBC.'],
  ];
}
