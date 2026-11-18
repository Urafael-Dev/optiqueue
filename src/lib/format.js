// Formato numérico único (es-ES) para toda la página: coma decimal y punto de miles.
const cache = new Map();
function nf(d) {
  if (!cache.has(d)) {
    cache.set(d, new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' }));
  }
  return cache.get(d);
}

export const num = (v, d = 2) => (Number.isFinite(v) ? nf(d).format(v) : '∞');
export const usd = (v, d = 2) => (Number.isFinite(v) ? `$${nf(d).format(v)}` : '∞');
export const pct = (v, d = 1) => (Number.isFinite(v) ? `${nf(d).format(v * 100)} %` : '∞');
export const minutes = (h, d = 3) => (Number.isFinite(h) ? `${nf(d).format(h * 60)} min` : '∞');
export const seconds = (h, d = 1) => (Number.isFinite(h) ? `${nf(d).format(h * 3600)} s` : '∞');
export const signed = (v, fmt) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v));

export function usdCompact(v) {
  if (Math.abs(v) >= 1e6) return `$${nf(2).format(v / 1e6)} M`;
  if (Math.abs(v) >= 1e3) return `$${nf(1).format(v / 1e3)} k`;
  return usd(v);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
