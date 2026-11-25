import { api } from './api.js';
import { escapar, renderizar } from './matematicas.js';

const $ = (id) => document.getElementById(id);
let preguntas = [];

function pintarPreguntas() {
  $('quiz-preguntas').innerHTML = preguntas
    .map((p) => {
      const cuerpo = p.tipo === 'opcion'
        ? p.opciones.map((o, k) => `<label class="opcion"><input type="radio" name="${p.id}" value="${k}"> <span>${o}</span></label>`).join('')
        : `<input type="text" inputmode="decimal" name="${p.id}" class="respuesta-num" placeholder="Tu respuesta">`;
      return `<li class="pregunta" data-id="${p.id}"><p>${p.enunciado}</p><div class="opciones">${cuerpo}</div><div class="retro"></div></li>`;
    })
    .join('');
  renderizar($('quiz-preguntas'));
}

async function cargarRanking() {
  try {
    const { ranking } = await api.ranking();
    $('quiz-ranking').innerHTML = ranking.length
      ? `<table><thead><tr><th>#</th><th>Nombre</th><th>Puntaje</th></tr></thead><tbody>${ranking
          .map((r, i) => `<tr><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td>${escapar(r.nombre)}</td><td>${r.puntaje} <span class="nota">(${r.aciertos}/${r.total})</span></td></tr>`)
          .join('')}</tbody></table>`
      : '<p class="nota">Nadie ha respondido todavía. ¡Sé el primero!</p>';
  } catch {
    $('quiz-ranking').innerHTML = '<p class="nota">Ranking no disponible.</p>';
  }
}

async function enviar(e) {
  e.preventDefault();
  const form = $('quiz-form');
  const respuestas = {};
  preguntas.forEach((p) => {
    const campo = form.elements[p.id];
    const valor = p.tipo === 'opcion' ? form.querySelector(`input[name="${p.id}"]:checked`)?.value : campo?.value;
    if (valor !== undefined && valor !== '') respuestas[p.id] = valor;
  });
  const salida = $('quiz-resultado');
  try {
    const nota = await api.enviarQuiz({
      nombre: $('quiz-nombre').value,
      correo: $('quiz-correo').value,
      respuestas,
    });
    nota.detalle.forEach((d) => {
      const li = form.querySelector(`.pregunta[data-id="${d.id}"]`);
      li.classList.toggle('bien', d.correcta);
      li.classList.toggle('mal', !d.correcta);
      li.querySelector('.retro').innerHTML = `${d.correcta ? '✔ Correcto.' : '✘ Incorrecto.'} ${d.explicacion}`;
    });
    renderizar(form);
    salida.innerHTML = `<p class="puntaje">Puntaje: <strong>${nota.puntaje}</strong> / 100 · ${nota.aciertos} de ${nota.total} correctas</p>`;
    cargarRanking();
  } catch (err) {
    salida.innerHTML = `<p class="error">${escapar(err.message)}</p>`;
  }
}

export async function iniciarQuiz() {
  $('quiz-form').addEventListener('submit', enviar);
  $('quiz-refrescar').addEventListener('click', cargarRanking);
  try {
    ({ preguntas } = await api.preguntas());
    pintarPreguntas();
  } catch (e) {
    $('quiz-preguntas').innerHTML = `<p class="error">${escapar(e.message)}</p>`;
  }
  cargarRanking();
}
