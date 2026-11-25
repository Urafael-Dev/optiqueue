import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { api } from './api.js';
import { escapar, fmtTex, leerNumero, renderizar, tex, texVector } from './matematicas.js';

const $ = (id) => document.getElementById(id);
const INICIAL = { A: [[1, 0], [0, 1], [1, 1]], b: [1, 1, 0] };
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

let escena, camara, renderer, etiquetas, controles, grupo;
let datos = structuredClone(INICIAL);
let temporizador = null;

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

function construirEntradas() {
  const nombres = ['a₁', 'a₂', 'b'];
  let html = '<div class="geo-cab"><span></span>' + nombres.map((n) => `<span>${n}</span>`).join('') + '</div>';
  ['x', 'y', 'z'].forEach((eje, i) => {
    html += `<div class="geo-fila"><span>${eje}</span>`;
    html += `<input inputmode="decimal" data-i="${i}" data-j="0" value="${datos.A[i][0]}" aria-label="a1 ${eje}">`;
    html += `<input inputmode="decimal" data-i="${i}" data-j="1" value="${datos.A[i][1]}" aria-label="a2 ${eje}">`;
    html += `<input inputmode="decimal" data-b="${i}" value="${datos.b[i]}" aria-label="b ${eje}">`;
    html += '</div>';
  });
  $('geo-entradas').innerHTML = html;
}

function leerEntradas() {
  const A = [[0, 0], [0, 0], [0, 0]];
  const b = [0, 0, 0];
  let ok = true;
  $('geo-entradas').querySelectorAll('input').forEach((inp) => {
    const v = leerNumero(inp.value);
    inp.classList.toggle('invalido', !Number.isFinite(v));
    if (!Number.isFinite(v)) ok = false;
    if (inp.dataset.b !== undefined) b[+inp.dataset.b] = v;
    else A[+inp.dataset.i][+inp.dataset.j] = v;
  });
  return ok ? { A, b } : null;
}

function etiqueta(texto, pos, color) {
  const div = document.createElement('div');
  div.className = 'etiqueta-3d';
  div.textContent = texto;
  div.style.color = color;
  const obj = new CSS2DObject(div);
  obj.position.copy(pos);
  return obj;
}

function flecha(desde, hasta, color, grosor = 1) {
  const dir = hasta.clone().sub(desde);
  const largo = dir.length();
  if (largo < 1e-6) return null;
  const cabeza = Math.min(0.28 * grosor, largo * 0.35);
  return new THREE.ArrowHelper(dir.normalize(), desde, largo, color, cabeza, cabeza * 0.55);
}

function linea(puntos, color, discontinua = false) {
  const geo = new THREE.BufferGeometry().setFromPoints(puntos);
  const mat = discontinua
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.12, gapSize: 0.08 })
    : new THREE.LineBasicMaterial({ color });
  const l = new THREE.Line(geo, mat);
  if (discontinua) l.computeLineDistances();
  return l;
}

function limpiar(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose?.();
    if (o.isCSS2DObject) o.element.remove();
  });
  obj.clear();
}

function dibujar(r) {
  limpiar(grupo);
  const col = {
    a: new THREE.Color(css('--col-a')), b: new THREE.Color(css('--col-b')),
    p: new THREE.Color(css('--col-p')), r: new THREE.Color(css('--col-r')),
    plano: new THREE.Color(css('--acento')), texto: css('--texto-2'),
  };
  const a1 = v3(datos.A.map((f) => f[0]));
  const a2 = v3(datos.A.map((f) => f[1]));
  const b = v3(datos.b);
  const p = v3(r.Ax);
  const [x1, x2] = r.x;
  const O = new THREE.Vector3();

  // Ejes
  const L = Math.max(2, b.length() * 1.3, p.length() * 1.3);
  [[new THREE.Vector3(L, 0, 0), 'x'], [new THREE.Vector3(0, L, 0), 'y'], [new THREE.Vector3(0, 0, L), 'z']].forEach(([fin, n]) => {
    grupo.add(linea([fin.clone().multiplyScalar(-0.4), fin], new THREE.Color(col.texto)));
    grupo.add(etiqueta(n, fin.clone().multiplyScalar(1.05), col.texto));
  });

  // Plano = espacio columna (parallelogramo s·a1 + t·a2)
  if (r.rango === 2) {
    const S = Math.max(1.2, Math.abs(x1) * 1.5, Math.abs(x2) * 1.5);
    const esquinas = [[-S, -S], [S, -S], [S, S], [-S, S]].map(([s, t]) => a1.clone().multiplyScalar(s).add(a2.clone().multiplyScalar(t)));
    const geo = new THREE.BufferGeometry().setFromPoints([esquinas[0], esquinas[1], esquinas[2], esquinas[0], esquinas[2], esquinas[3]]);
    grupo.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col.plano, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })));
    grupo.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(esquinas), new THREE.LineBasicMaterial({ color: col.plano, transparent: true, opacity: 0.6 })));
    for (let k = -2; k <= 2; k++) {
      const f = (k / 2) * S;
      const c1 = a1.clone().multiplyScalar(f);
      const c2 = a2.clone().multiplyScalar(f);
      grupo.add(linea([c1.clone().add(a2.clone().multiplyScalar(-S)), c1.clone().add(a2.clone().multiplyScalar(S))], col.plano));
      grupo.add(linea([c2.clone().add(a1.clone().multiplyScalar(-S)), c2.clone().add(a1.clone().multiplyScalar(S))], col.plano));
    }
    grupo.children.slice(-10).forEach((l) => { l.material.transparent = true; l.material.opacity = 0.18; });
    grupo.add(etiqueta('Col(A)', esquinas[2].clone().multiplyScalar(0.92), css('--acento')));
  }

  // Columnas, b, proyección y residuo
  [[a1, 'a₁'], [a2, 'a₂']].forEach(([v, n]) => {
    const f = flecha(O, v, col.a);
    if (f) { grupo.add(f); grupo.add(etiqueta(n, v.clone().multiplyScalar(1.12), css('--col-a'))); }
  });
  // Combinación x̂1·a1 + x̂2·a2 (líneas discontinuas)
  const c1 = a1.clone().multiplyScalar(x1);
  grupo.add(linea([O, c1, p], col.p, true));

  const fb = flecha(O, b, col.b, 1.2);
  if (fb) { grupo.add(fb); grupo.add(etiqueta('b', b.clone().multiplyScalar(1.08), css('--col-b'))); }
  const fp = flecha(O, p, col.p, 1.2);
  if (fp) { grupo.add(fp); grupo.add(etiqueta('Ax̂', p.clone().multiplyScalar(1.1).add(new THREE.Vector3(0, 0, -0.15)), css('--col-p'))); }
  const fr = flecha(p, b, col.r, 1);
  if (fr) {
    grupo.add(fr);
    grupo.add(etiqueta('r', p.clone().lerp(b, 0.5).add(new THREE.Vector3(0.12, 0.12, 0)), css('--col-r')));
    // Marca de ángulo recto entre r y el plano
    const u = b.clone().sub(p).normalize();
    const w = p.length() > 1e-6 ? p.clone().normalize().multiplyScalar(-1) : a1.clone().normalize();
    w.sub(u.clone().multiplyScalar(w.dot(u))).normalize();
    const e = Math.min(0.22, b.distanceTo(p) * 0.4);
    grupo.add(linea([p.clone().add(w.clone().multiplyScalar(e)), p.clone().add(w.clone().multiplyScalar(e)).add(u.clone().multiplyScalar(e)), p.clone().add(u.clone().multiplyScalar(e))], col.r));
  }

  renderizarEscena();
  mostrarDatos(r);
}

function mostrarDatos(r) {
  const punto = (a) => a.map((v) => fmtTex(v, 4));
  const d1 = r.ortogonalidad[0];
  const d2 = r.ortogonalidad[1];
  let html = `
    <p>${tex(`\\hat{\\mathbf{x}} = ${texVector(r.x.map((v) => Number(v.toPrecision(5))))}`)}</p>
    <p>${tex(`A\\hat{\\mathbf{x}} = (${punto(r.Ax).join(',\\ ')})`)}</p>
    <p>${tex(`\\mathbf{r} = (${punto(r.residuo).join(',\\ ')})`)}</p>
    <p>${tex(`\\lVert\\mathbf{r}\\rVert_2 = ${fmtTex(r.norma_residuo, 5)}`)}</p>
    <p>${tex(`\\mathbf{a}_1\\cdot\\mathbf{r} = ${fmtTex(d1, 3)},\\ \\mathbf{a}_2\\cdot\\mathbf{r} = ${fmtTex(d2, 3)}`)}</p>`;
  if (r.consistente) html += '<p class="nota">b está en el plano: el sistema es consistente y el residuo es cero.</p>';
  if (r.rango < 2) html += '<p class="nota">Las columnas son paralelas: el espacio columna es una recta, se usa la pseudoinversa.</p>';
  $('geo-datos').innerHTML = html;
}

async function actualizar() {
  const leido = leerEntradas();
  if (!leido) return;
  datos = leido;
  if (!renderer) return; // la escena aún no existe; se dibuja al crearla
  try {
    dibujar(await api.resolver(datos.A, datos.b));
  } catch (e) {
    $('geo-datos').innerHTML = `<p class="error">${escapar(e.message)}</p>`;
  }
}

function renderizarEscena() {
  if (!renderer) return;
  renderer.render(escena, camara);
  etiquetas.render(escena, camara);
}

function iniciarEscena() {
  const cont = $('geo-lienzo');
  escena = new THREE.Scene();
  camara = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camara.up.set(0, 0, 1);
  camara.position.set(3.6, -3.9, 2.8);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  cont.appendChild(renderer.domElement);

  etiquetas = new CSS2DRenderer();
  etiquetas.domElement.className = 'capa-etiquetas';
  cont.appendChild(etiquetas.domElement);

  controles = new OrbitControls(camara, etiquetas.domElement);
  controles.target.set(0.5, 0.4, 0.4);
  controles.enableDamping = false;
  controles.addEventListener('change', renderizarEscena);
  controles.update();

  grupo = new THREE.Group();
  escena.add(grupo);

  const redimensionar = () => {
    const { clientWidth: w, clientHeight: h } = cont;
    if (!w || !h) return;
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
    renderer.setSize(w, h);
    etiquetas.setSize(w, h);
    renderizarEscena();
  };
  new ResizeObserver(redimensionar).observe(cont);
  redimensionar();
}

export function iniciarGeometria() {
  construirEntradas();
  renderizar(document.getElementById('geometria'));

  $('geo-entradas').addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(actualizar, 250);
  });
  $('geo-reset').addEventListener('click', () => {
    datos = structuredClone(INICIAL);
    construirEntradas();
    actualizar();
  });
  window.addEventListener('cargar-3d', (e) => {
    datos = structuredClone(e.detail);
    construirEntradas();
    actualizar();
  });
  window.addEventListener('tema-cambiado', () => renderer && actualizar());

  // La escena WebGL se crea solo cuando la sección se acerca a la pantalla.
  const obs = new IntersectionObserver((entradas) => {
    if (entradas.some((e) => e.isIntersecting)) {
      obs.disconnect();
      try {
        iniciarEscena();
      } catch {
        $('geo-lienzo').innerHTML = '<p class="error">Tu navegador no admite WebGL.</p>';
        return;
      }
      actualizar();
    }
  }, { rootMargin: '300px' });
  obs.observe($('geo-lienzo'));
}
