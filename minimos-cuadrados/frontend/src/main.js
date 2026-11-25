import 'katex/dist/katex.min.css';
import './style.css';
import { api } from './api.js';
import { iniciarAjuste } from './ajuste.js';
import { iniciarCalculadora } from './calculadora.js';
import { iniciarGeometria } from './geometria3d.js';
import { renderizar } from './matematicas.js';
import { iniciarQuiz } from './quiz.js';

// Tema claro / oscuro (se recuerda en este navegador).
const raiz = document.documentElement;
try {
  const guardado = localStorage.getItem('tema');
  if (guardado) raiz.dataset.theme = guardado;
} catch { /* almacenamiento no disponible */ }

document.getElementById('btn-tema').addEventListener('click', () => {
  const oscuroActual = raiz.dataset.theme
    ? raiz.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  raiz.dataset.theme = oscuroActual ? 'light' : 'dark';
  try { localStorage.setItem('tema', raiz.dataset.theme); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event('tema-cambiado'));
});

// Menú en móviles
const enlaces = document.getElementById('nav-links');
document.getElementById('btn-menu').addEventListener('click', () => enlaces.classList.toggle('abierto'));
enlaces.addEventListener('click', (e) => e.target.tagName === 'A' && enlaces.classList.remove('abierto'));

// Indicador de conexión con Django
const indicador = document.getElementById('estado-api');
api.estado()
  .then(() => { indicador.classList.add('ok'); indicador.title = 'Backend de Django en línea'; })
  .catch(() => { indicador.classList.add('caido'); indicador.title = 'Backend no disponible'; });

renderizar(document.body);
iniciarCalculadora();
iniciarAjuste();
iniciarGeometria();
iniciarQuiz();
