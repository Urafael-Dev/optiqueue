import {
  BarController, BarElement, CategoryScale, Chart, Legend, LinearScale, LineController,
  LineElement, PointElement, ScatterController, Tooltip,
} from 'chart.js';
import { api } from './api.js';
import { escapar, fmt, fmtTex, leerNumero, renderizar, tex, texMatriz, texVector } from './matematicas.js';

Chart.register(ScatterController, LineController, BarController, LinearScale, CategoryScale,
  PointElement, LineElement, BarElement, Tooltip, Legend);

const $ = (id) => document.getElementById(id);
let grafica = null;
let graficaResiduos = null;

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function leerPuntos() {
  const xs = [];
  const ys = [];
  const lineas = $('aj-puntos').value.split('\n').map((l) => l.trim()).filter(Boolean);
  lineas.forEach((linea, k) => {
    // Separadores: tab o «;» (permiten coma decimal), espacios («1,5 2,3» o «0, 1.1»), o «x,y».
    let partes;
    if (/[\t;]/.test(linea)) partes = linea.split(/[\t;]+/);
    else if (/\s/.test(linea)) partes = linea.split(/\s+/).map((p) => p.replace(/,$/, ''));
    else partes = linea.split(',');
    partes = partes.map((p) => p.trim()).filter(Boolean);
    if (partes.length !== 2) throw new Error(`Línea ${k + 1}: se esperaban dos números «x, y».`);
    const x = leerNumero(partes[0]);
    const y = leerNumero(partes[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`Línea ${k + 1}: «${linea}» no son dos números.`);
    xs.push(x);
    ys.push(y);
  });
  if (xs.length < 2) throw new Error('Escribe al menos dos puntos.');
  return { xs, ys };
}

function colores() {
  return {
    texto: css('--texto-2'),
    rejilla: css('--borde'),
    puntos: css('--col-b'),
    curva: css('--acento'),
    residuo: css('--col-r'),
  };
}

function dibujar(r, xs, ys) {
  const c = colores();
  const escalas = (tituloY) => ({
    x: { type: 'linear', ticks: { color: c.texto }, grid: { color: c.rejilla }, title: { display: true, text: 'x', color: c.texto } },
    y: { ticks: { color: c.texto }, grid: { color: c.rejilla }, title: { display: true, text: tituloY, color: c.texto } },
  });

  grafica?.destroy();
  grafica = new Chart($('aj-grafica'), {
    type: 'scatter',
    data: {
      datasets: [
        { label: 'Datos', data: xs.map((x, i) => ({ x, y: ys[i] })), backgroundColor: c.puntos, pointRadius: 5 },
        {
          label: 'Ajuste', type: 'line', data: r.curva.x.map((x, i) => ({ x, y: r.curva.y[i] })),
          borderColor: c.curva, borderWidth: 2.5, pointRadius: 0, tension: 0,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      plugins: { legend: { labels: { color: c.texto } }, tooltip: { callbacks: { label: (t) => `(${fmt(t.parsed.x, 4)}, ${fmt(t.parsed.y, 4)})` } } },
      scales: escalas('y'),
    },
  });

  graficaResiduos?.destroy();
  graficaResiduos = new Chart($('aj-residuos'), {
    type: 'bar',
    data: {
      labels: xs.map((x) => fmt(x, 4)),
      datasets: [{ label: 'Residuo yᵢ − ŷᵢ', data: r.residuos, backgroundColor: c.residuo, borderRadius: 3 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      plugins: { legend: { labels: { color: c.texto } } },
      scales: { x: { ticks: { color: c.texto }, grid: { display: false } }, y: { ticks: { color: c.texto }, grid: { color: c.rejilla } } },
    },
  });
}

function mostrar(r, xs, ys) {
  $('aj-resumen').innerHTML = `
    <div class="formula-scroll">${tex(r.ecuacion, true)}</div>
    <div class="metricas">
      <div><span>R²</span><strong>${fmt(r.r2, 5)}</strong></div>
      <div><span>Σ r²</span><strong>${fmt(r.sse, 5)}</strong></div>
      <div><span>Sistema</span><strong>${r.puntos} × ${r.parametros}</strong></div>
    </div>`;

  const s = r.sistema;
  const filas = xs.map((x, i) => `<tr><td>${i + 1}</td><td>${fmt(x)}</td><td>${fmt(ys[i])}</td><td>${fmt(r.y_ajustado[i])}</td><td>${fmt(r.residuos[i])}</td></tr>`).join('');
  const muestraA = r.matriz_diseno.length > 8 ? r.matriz_diseno.slice(0, 8) : r.matriz_diseno;
  const muestraB = r.vector_b.length > 8 ? r.vector_b.slice(0, 8) : r.vector_b;
  const recorte = r.matriz_diseno.length > 8 ? `<p class="nota">Se muestran las primeras 8 de ${r.puntos} filas.</p>` : '';

  $('aj-detalle').innerHTML = `
    <div class="grid-2">
      <div class="tarjeta">
        <h4>Sistema sobredeterminado que se resuelve</h4>
        ${r.transformacion ? `<p>Linealización: ${tex(r.transformacion)}</p>` : ''}
        <div class="formula-scroll">${tex(`A = ${texMatriz(muestraA)},\\quad \\mathbf{b} = ${texVector(muestraB)}`, true)}</div>
        ${recorte}
        ${s.AtA ? `<div class="formula-scroll">${tex(`A^TA = ${texMatriz(s.AtA)},\\quad A^T\\mathbf{b} = ${texVector(s.Atb)}`, true)}</div>
        <p class="nota">${tex(`\\kappa(A^TA) = ${fmtTex(s.condicion_AtA, 4)}`)} · método: ${escapar(s.metodo)}</p>` : `<p class="nota">Método: ${escapar(s.metodo)} (rango ${s.rango} de ${s.n})</p>`}
      </div>
      <div class="tarjeta">
        <h4>Valores ajustados</h4>
        <div class="tabla-contenedor"><table>
          <thead><tr><th>i</th><th>x</th><th>y</th><th>ŷ</th><th>r = y − ŷ</th></tr></thead>
          <tbody>${filas}</tbody>
        </table></div>
        ${r.transformacion ? '<p class="nota">En los modelos linealizados se minimiza el error de ln y, no el de y; por eso R² se calcula sobre los datos originales.</p>' : ''}
      </div>
    </div>`;
  renderizar($('aj-detalle'));
}

async function ajustar() {
  let xs, ys;
  try {
    ({ xs, ys } = leerPuntos());
  } catch (e) {
    $('aj-resumen').innerHTML = `<p class="error">${escapar(e.message)}</p>`;
    return;
  }
  $('aj-resumen').innerHTML = '<p class="cargando">Ajustando…</p>';
  try {
    const r = await api.ajustar({ x: xs, y: ys, modelo: $('aj-modelo').value, grado: Number($('aj-grado').value) });
    dibujar(r, xs, ys);
    mostrar(r, xs, ys);
  } catch (e) {
    $('aj-resumen').innerHTML = `<p class="error">${escapar(e.message)}</p>`;
  }
}

export function iniciarAjuste() {
  const sincronizarGrado = () => {
    $('aj-grado-label').hidden = $('aj-modelo').value !== 'polinomial';
  };
  $('aj-modelo').addEventListener('change', () => { sincronizarGrado(); ajustar(); });
  $('aj-grado').addEventListener('change', ajustar);
  $('aj-ajustar').addEventListener('click', ajustar);
  $('aj-datos-exp').addEventListener('click', () => {
    // Crecimiento de una población de bacterias (miles) cada hora.
    $('aj-puntos').value = '0, 2.1\n1, 3.4\n2, 5.8\n3, 9.1\n4, 15.4\n5, 24.9\n6, 41.2';
    $('aj-modelo').value = 'exponencial';
    sincronizarGrado();
    ajustar();
  });
  // Recolorear las gráficas al cambiar de tema.
  window.addEventListener('tema-cambiado', () => grafica && ajustar());
  sincronizarGrado();
  ajustar();
}
