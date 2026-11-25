import { api } from './api.js';
import { escapar, fmt, fmtTex, leerNumero, renderizar, tex, texAumentada, texMatriz, texVector } from './matematicas.js';

const $ = (id) => document.getElementById(id);

const NOMBRES_METODO = {
  ecuaciones_normales: 'Ecuaciones normales + Gauss',
  norma_minima: 'Norma mínima  x = Aᵀ(AAᵀ)⁻¹b',
  pseudoinversa: 'Pseudoinversa (SVD)',
  gauss_directo: 'Gauss directo (sistema cuadrado)',
  nulo: 'Matriz nula',
};

let ejemplos = [];

function construirMatriz(m, n, A = null, b = null) {
  const cont = $('calc-matriz');
  cont.style.setProperty('--cols', n);
  let html = '<div class="fila-cabecera">';
  for (let j = 0; j < n; j++) html += `<span>x<sub>${j + 1}</sub></span>`;
  html += '<span class="sep"></span><span>b</span></div>';
  for (let i = 0; i < m; i++) {
    html += '<div class="fila-matriz">';
    for (let j = 0; j < n; j++) {
      const v = A?.[i]?.[j] ?? (i === j ? 1 : 0);
      html += `<input inputmode="decimal" data-i="${i}" data-j="${j}" value="${v}" aria-label="A fila ${i + 1} columna ${j + 1}">`;
    }
    html += `<span class="sep">|</span><input inputmode="decimal" data-b="${i}" value="${b?.[i] ?? 0}" aria-label="b fila ${i + 1}">`;
    html += '</div>';
  }
  cont.innerHTML = html;
}

function leerMatriz() {
  const m = Number($('calc-m').value);
  const n = Number($('calc-n').value);
  const A = Array.from({ length: m }, () => Array(n).fill(0));
  const b = Array(m).fill(0);
  let invalido = null;
  $('calc-matriz').querySelectorAll('input').forEach((inp) => {
    const v = leerNumero(inp.value);
    inp.classList.toggle('invalido', !Number.isFinite(v));
    if (!Number.isFinite(v) && !invalido) invalido = inp;
    if (inp.dataset.b !== undefined) b[+inp.dataset.b] = v;
    else A[+inp.dataset.i][+inp.dataset.j] = v;
  });
  if (invalido) {
    invalido.focus();
    throw new Error('Hay celdas vacías o que no son números (marcadas en rojo).');
  }
  return { A, b };
}

function cargar(A, b) {
  $('calc-m').value = A.length;
  $('calc-n').value = A[0].length;
  construirMatriz(A.length, A[0].length, A, b);
}

function textoMetodo(r) {
  switch (r.metodo) {
    case 'ecuaciones_normales':
      return `\\(A\\) tiene rango completo por columnas (\\(\\operatorname{rango}=n=${r.n}\\)), así que \\(A^TA\\) es invertible y la solución de mínimos cuadrados es única.`;
    case 'norma_minima':
      return `\\(A\\) tiene rango completo por filas (\\(\\operatorname{rango}=m=${r.m}\\)). Hay infinitas soluciones exactas; se resuelve \\((AA^T)\\mathbf{y}=\\mathbf{b}\\) y se toma \\(\\mathbf{x}=A^T\\mathbf{y}\\), la de menor norma.`;
    case 'pseudoinversa':
      return `\\(\\operatorname{rango}(A)=${r.rango} < \\min(m,n)=${Math.min(r.m, r.n)}\\): \\(A^TA\\) y \\(AA^T\\) son singulares. Se usa la SVD y se anulan los valores singulares menores que \\(${fmtTex(r.tolerancia_rango)}\\).`;
    case 'gauss_directo':
      return 'El sistema es cuadrado y no singular: tiene solución exacta única, no hace falta mínimos cuadrados.';
    default:
      return 'La matriz es nula: cualquier \\(\\mathbf{x}\\) da el mismo residuo; se devuelve \\(\\mathbf{x}=\\mathbf{0}\\).';
  }
}

function htmlPasos(pasos) {
  if (!pasos?.length) return '';
  const items = pasos.map((p, k) => {
    let extra = '';
    if (p.tipo === 'eliminacion') {
      extra = p.operaciones
        .map((o) => `F_{${o.fila}} \\leftarrow F_{${o.fila}} ${o.factor < 0 ? '+' : '-'} ${fmtTex(Math.abs(o.factor))}\\,F_{${o.pivote}}`)
        .join(',\\quad ');
      extra = `<div class="op">${tex(extra)}</div>`;
    } else if (p.tipo === 'sustitucion') {
      extra = p.valores
        .map((v) => `<div class="op">${tex(`v_{${v.variable}} = \\dfrac{${fmtTex(v.numerador)}}{${fmtTex(v.pivote)}} = ${fmtTex(v.valor)}`)}</div>`)
        .join('');
    }
    const matriz = p.tipo === 'sustitucion' ? '' : `<div class="formula-scroll">${tex(texAumentada(p.matriz), true)}</div>`;
    return `<li><strong>Paso ${k + 1}.</strong> ${escapar(p.descripcion)}${extra}${matriz}</li>`;
  });
  return `<details class="pasos" open><summary>Eliminación de Gauss con pivoteo parcial (${pasos.length} pasos)</summary><ol>${items.join('')}</ol></details>`;
}

function mostrar(r, A, b) {
  const chips = [
    `<span class="chip chip-${r.forma}">${r.forma}</span>`,
    `<span class="chip">${r.m} × ${r.n}</span>`,
    `<span class="chip">rango(A) = ${r.rango}</span>`,
    `<span class="chip">rango([A|b]) = ${r.rango_aumentado}</span>`,
    `<span class="chip ${r.consistente ? 'chip-ok' : 'chip-alerta'}">${r.consistente ? 'consistente' : 'inconsistente'}</span>`,
    `<span class="chip">soluciones exactas: ${r.soluciones}</span>`,
  ].join('');

  const vars = r.x.map((_, j) => `x_{${j + 1}}`);
  let html = `
    <div class="tarjeta">
      <div class="chips">${chips}</div>
      <h3>Método: ${escapar(NOMBRES_METODO[r.metodo] || r.metodo)}</h3>
      <p>${textoMetodo(r)}</p>
      <div class="formula">${tex(r.formula, true)}</div>
    </div>`;

  if (r.metodo === 'ecuaciones_normales') {
    html += `
      <div class="tarjeta">
        <h4>Ecuaciones normales</h4>
        <div class="formula-scroll">${tex(`A^TA = ${texMatriz(r.AtA)},\\qquad A^T\\mathbf{b} = ${texVector(r.Atb)}`, true)}</div>
        <p class="nota">${tex(`\\kappa(A) = ${fmtTex(r.condicion_A, 4)}`)} &nbsp;·&nbsp; ${tex(`\\kappa(A^TA) = ${fmtTex(r.condicion_AtA, 4)} \\approx \\kappa(A)^2`)}</p>
      </div>`;
  } else if (r.metodo === 'norma_minima') {
    html += `
      <div class="tarjeta">
        <h4>Sistema reducido \\(AA^T\\mathbf{y}=\\mathbf{b}\\)</h4>
        <div class="formula-scroll">${tex(`AA^T = ${texMatriz(r.AAt)},\\qquad \\mathbf{y} = ${texVector(r.y)}`, true)}</div>
      </div>`;
  } else if (r.metodo === 'pseudoinversa') {
    html += `
      <div class="tarjeta">
        <h4>Descomposición en valores singulares</h4>
        <p>${tex(`\\sigma = (${r.valores_singulares.map((s) => fmtTex(s, 4)).join(',\\ ')})`)}</p>
        <div class="formula-scroll">${tex(`A^{+} = ${texMatriz(r.pseudoinversa)}`, true)}</div>
      </div>`;
  }

  html += htmlPasos(r.pasos);

  const solucion = `\\hat{\\mathbf{x}} = \\begin{bmatrix}${vars.join('\\\\')}\\end{bmatrix} = ${texVector(r.x)}`;
  let general = '';
  if (r.base_nucleo.length && r.metodo !== 'ecuaciones_normales') {
    const ts = r.base_nucleo.map((v, k) => `t_{${k + 1}}${texVector(v)}`).join(' + ');
    general = `<p>Solución general (todas dan el mismo residuo):</p>
      <div class="formula-scroll">${tex(`\\mathbf{x} = \\hat{\\mathbf{x}} + ${ts},\\quad t_k\\in\\mathbb{R}`, true)}</div>
      <p class="nota">\\(\\hat{\\mathbf{x}}\\) es la de menor norma: \\(\\lVert\\hat{\\mathbf{x}}\\rVert_2 = ${fmtTex(r.norma_x)}\\).</p>`;
  }

  html += `
    <div class="grid-2">
      <div class="tarjeta destacada">
        <h4>Solución</h4>
        <div class="formula-scroll">${tex(solucion, true)}</div>
        ${general}
      </div>
      <div class="tarjeta">
        <h4>Residuo y verificación</h4>
        <div class="formula-scroll">${tex(`\\mathbf{r} = \\mathbf{b} - A\\hat{\\mathbf{x}} = ${texVector(r.residuo)}`, true)}</div>
        <p>${tex(`\\lVert\\mathbf{r}\\rVert_2 = ${fmtTex(r.norma_residuo)}`)} &nbsp;·&nbsp; ${tex(`\\textstyle\\sum r_i^2 = ${fmtTex(r.suma_cuadrados)}`)}</p>
        <p>${tex(`A^T\\mathbf{r} = ${texVector(r.ortogonalidad)}`)} <span class="nota">(≈ 0: el residuo es ortogonal a las columnas)</span></p>
        <p class="nota">Diferencia con <code>numpy.linalg.lstsq</code>: ${fmt(r.diferencia_numpy)}${r.diferencia_qr !== undefined ? ` · con QR: ${fmt(r.diferencia_qr)}` : ''}</p>
      </div>
    </div>`;

  if (r.m === 3 && r.n === 2) {
    html += '<button class="btn btn-secundario" id="calc-ver-3d">Ver este sistema en 3D</button>';
  }

  const cont = $('calc-resultado');
  cont.innerHTML = html;
  renderizar(cont);
  $('calc-ver-3d')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('cargar-3d', { detail: { A, b } }));
    document.getElementById('geometria').scrollIntoView({ behavior: 'smooth' });
  });
}

async function resolver() {
  const cont = $('calc-resultado');
  let A, b;
  try {
    ({ A, b } = leerMatriz());
  } catch (e) {
    cont.innerHTML = `<p class="error">${escapar(e.message)}</p>`;
    return;
  }
  cont.innerHTML = '<p class="cargando">Resolviendo…</p>';
  try {
    const r = await api.resolver(A, b);
    mostrar(r, A, b);
    cargarHistorial();
  } catch (e) {
    cont.innerHTML = `<p class="error">${escapar(e.message)}</p>`;
  }
}

async function cargarHistorial() {
  try {
    const { historial } = await api.historial();
    $('calc-historial').innerHTML = historial.length
      ? `<table><thead><tr><th>Tipo</th><th>Tamaño</th><th>Forma</th><th>Método</th><th>‖r‖₂</th></tr></thead><tbody>${historial
          .map((h) => `<tr><td>${escapar(h.tipo)}</td><td>${h.tamano}</td><td>${escapar(h.forma)}</td><td>${escapar(h.metodo)}</td><td>${fmt(h.norma_residuo, 4)}</td></tr>`)
          .join('')}</tbody></table>`
      : '<p class="nota">Aún no hay resoluciones.</p>';
  } catch {
    $('calc-historial').innerHTML = '<p class="nota">Historial no disponible.</p>';
  }
}

function aleatorio() {
  const m = Number($('calc-m').value);
  const n = Number($('calc-n').value);
  const r = () => Math.round((Math.random() * 10 - 5) * 2) / 2;
  construirMatriz(m, n, Array.from({ length: m }, () => Array.from({ length: n }, r)), Array.from({ length: m }, r));
}

export function cargarEjemplo(id) {
  const e = ejemplos.find((x) => x.id === id);
  if (!e) return;
  $('calc-ejemplo').value = id;
  cargar(e.A, e.b);
  document.getElementById('calculadora').scrollIntoView({ behavior: 'smooth' });
  resolver();
}

export async function iniciarCalculadora() {
  const redimensionar = () => {
    const m = Math.min(12, Math.max(1, Number($('calc-m').value) || 1));
    const n = Math.min(8, Math.max(1, Number($('calc-n').value) || 1));
    $('calc-m').value = m;
    $('calc-n').value = n;
    let A = null, b = null;
    try { ({ A, b } = leerMatriz()); } catch { /* conserva lo que se pueda */ }
    construirMatriz(m, n, A, b);
  };
  $('calc-m').addEventListener('change', redimensionar);
  $('calc-n').addEventListener('change', redimensionar);
  $('calc-resolver').addEventListener('click', resolver);
  $('calc-aleatorio').addEventListener('click', aleatorio);
  $('calc-matriz').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') resolver();
  });
  $('calc-ejemplo').addEventListener('change', (e) => cargarEjemplo(e.target.value));
  document.querySelectorAll('[data-cargar-ejemplo]').forEach((btn) =>
    btn.addEventListener('click', () => cargarEjemplo(btn.dataset.cargarEjemplo)),
  );

  construirMatriz(4, 2, [[1, 1], [1, 2], [1, 3], [1, 4]], [2, 3, 5, 6]);
  try {
    ({ ejemplos } = await api.ejemplos());
    $('calc-ejemplo').innerHTML += ejemplos
      .map((e) => `<option value="${e.id}">${escapar(e.titulo)}</option>`)
      .join('');
  } catch {
    /* sin backend: la calculadora mostrará el error al resolver */
  }
  cargarHistorial();
}
