import katex from 'katex';
import renderMathInElement from 'katex/contrib/auto-render';

// Formato corto y estable: hasta 6 cifras significativas, sin "-0".
export function fmt(v, cifras = 6) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  if (Math.abs(v) < 1e-10) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-4) return v.toExponential(3).replace('e', '·10^').replace('+', '');
  return String(Number(v.toPrecision(cifras)));
}

// Versión para LaTeX (notación científica como potencia de 10).
export function fmtTex(v, cifras = 6) {
  const s = fmt(v, cifras);
  const m = s.match(/^(-?[\d.]+)·10\^(-?\d+)$/);
  return m ? `${m[1]}\\times10^{${m[2]}}` : s.replace('∞', '\\infty');
}

export const texMatriz = (M) =>
  `\\begin{bmatrix}${M.map((f) => f.map((v) => fmtTex(v)).join('&')).join('\\\\')}\\end{bmatrix}`;

export const texVector = (v) => texMatriz(v.map((x) => [x]));

export function texAumentada(M) {
  const n = M[0].length - 1;
  const cols = `${'c'.repeat(n)}|c`;
  return `\\left[\\begin{array}{${cols}}${M.map((f) => f.map((v) => fmtTex(v)).join('&')).join('\\\\')}\\end{array}\\right]`;
}

export const tex = (s, display = false) =>
  katex.renderToString(s, { displayMode: display, throwOnError: false, strict: false });

export function renderizar(el) {
  renderMathInElement(el, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\(', right: '\\)', display: false },
    ],
    throwOnError: false,
    strict: false,
  });
}

// Admite "1,5" o "1.5" como decimal.
export function leerNumero(texto) {
  const limpio = String(texto).trim().replace(',', '.');
  if (limpio === '') return NaN;
  return Number(limpio);
}

export const escapar = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
