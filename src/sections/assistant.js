import { PARAMS as P } from '../config.js';
import { mmc, optimize } from '../lib/queue.js';
import { optimalityRange, paramDef } from '../lib/sensitivity.js';
import { simulate } from '../lib/simulation.js';
import { escapeHtml } from '../lib/format.js';
import { provide, use } from '../lib/bridge.js';
import { MODELS } from '../lib/models.js';
import { runSpec, specToHash, summarize } from '../lib/solverSpec.js';
import { refreshIcons } from '../ui.js';

/**
 * Asistente con IA (Claude). El navegador lleva la conversación y ejecuta las
 * herramientas con los mismos cálculos de la app; /api/asistente solo hace de proxy
 * (guarda la clave y transmite la respuesta en vivo).
 */

const ENDPOINT = 'api/asistente';
const MAX_TURNS = 8; // llamadas al modelo por pregunta (cada uso de herramientas suma una)
const SUGGESTIONS = {
  principal: [
    ['door-open', '¿Por qué conviene abrir 15 ventanillas y no 16?'],
    ['git-compare', 'Compara en la app λ = 200, 220 y 240 pasajeros por hora'],
    ['flask-conical', 'Recalcula toda la app con μ = 14 y dime qué cambia'],
    ['calculator', 'Resuelve: a un banco llegan 30 clientes/h y hay 2 cajeros que atienden 20/h cada uno'],
    ['plane', 'Muéstrame el gemelo digital con 13 ventanillas'],
  ],
  resolvedor: [
    ['calculator', 'Llegan 12 clientes por hora a un cajero que atiende en 4 minutos. ¿Cuánto esperan?'],
    ['factory', '8 máquinas fallan cada 10 h y un mecánico repara en 1 h. ¿Conviene un segundo mecánico si cuesta $15/h y cada máquina parada $50/h?'],
    ['square-stack', 'Una peluquería tiene 3 sillas de espera: ¿cuántos clientes se pierden?'],
    ['circle-help', '¿Cuál es la diferencia entre M/M/1, M/D/1 y M/G/1?'],
    ['trophy', 'Encuentra cuántos servidores minimizan el costo del ejercicio cargado'],
  ],
};
const TOOL_LABELS = {
  calcular_mmc: 'Cálculo M/M/c', optimizar: 'Optimización', rango_optimalidad: 'Sensibilidad', simular: 'Simulación', ir_a_seccion: 'Navegación',
  configurar_gemelo: 'Gemelo digital', estado_app: 'Estado de la app', aplicar_escenario: 'Escenario aplicado', restaurar_enunciado: 'Escenario base restaurado',
  agregar_a_comparador: 'Comparador', quitar_del_comparador: 'Comparador', ajustar_sensibilidad: 'Sensibilidad', ejecutar_simulacion: 'Simulación en la app',
  resolver_cola: 'Resolvedor de colas', mostrar_en_resolvedor: 'Resolvedor de colas',
};
const SECTION_NAMES = {
  inicio: 'Resumen', respuestas: 'Recomendación', grafico: 'Costo vs. espera', escenarios: 'Escenarios', comparador: 'Comparador', sensibilidad: 'Sensibilidad',
  demanda: 'Demanda por hora', gemelo: 'Gemelo digital', simulacion: 'Simulación', formulacion: 'Modelo matemático', codigo: 'Código Python',
};

// ---------- Herramientas (se ejecutan aquí, con los cálculos de la app) ----------
const round = (v, d = 4) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);
const WIDE = { xMin: 1, xMax: 80 };

class ToolInputError extends Error {}
const check = (input, spec) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ToolInputError('La entrada debe ser un objeto.');
  for (const key of Object.keys(input)) if (!(key in spec)) throw new ToolInputError(`Campo desconocido: ${key}.`);
  for (const [key, [type, min, max, required]] of Object.entries(spec)) {
    const v = input[key];
    if (v === undefined) {
      if (required) throw new ToolInputError(`Falta el campo ${key}.`);
      continue;
    }
    if (type === 'int' && !Number.isInteger(v)) throw new ToolInputError(`${key} debe ser un entero.`);
    if ((type === 'num' || type === 'int') && (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)) throw new ToolInputError(`${key} debe estar entre ${min} y ${max}.`);
    if (type === 'bool' && typeof v !== 'boolean') throw new ToolInputError(`${key} debe ser true o false.`);
    if (type === 'enum' && !min.includes(v)) throw new ToolInputError(`${key} debe ser uno de: ${min.join(', ')}.`);
    if (type === 'str' && (typeof v !== 'string' || !v.trim() || v.length > 60)) throw new ToolInputError(`${key} debe ser un texto de hasta 60 caracteres.`);
  }
  return input;
};
const PARAM_SPEC = {
  lambda: ['num', 1, 2000],
  mu: ['num', 1, 200],
  costo_ventanilla: ['num', 0, 10000],
  costo_espera: ['num', 0, 10000],
  espera_max_min: ['num', 0.05, 120],
};
const paramsFrom = (i) => ({
  ...P,
  lambda: i.lambda ?? P.lambda,
  mu: i.mu ?? P.mu,
  cs: i.costo_ventanilla ?? P.cs,
  cw: i.costo_espera ?? P.cw,
  wqMaxH: i.espera_max_min != null ? i.espera_max_min / 60 : P.wqMaxH,
});
const metrics = (m) => ({
  ventanillas: m.c,
  estable: m.stable,
  utilizacion_pct: round(m.rho * 100, 2),
  prob_esperar_pct: round(m.Pw * 100, 2),
  Lq_pasajeros: round(m.Lq, 4),
  L_pasajeros: round(m.L, 4),
  Wq_segundos: round(m.Wq * 3600, 2),
  W_minutos: round(m.W * 60, 3),
  costo_servicio_usd_h: round(m.serviceCost, 2),
  costo_espera_usd_h: round(m.waitCost, 2),
  costo_total_usd_h: round(m.totalCost, 2),
  cumple_limite_espera: m.meetsSla,
});

const TOOLS = {
  calcular_mmc(input, chip) {
    const i = check(input, { ventanillas: ['int', 1, 80, true], ...PARAM_SPEC });
    chip(`Calculando M/M/c con ${i.ventanillas} ventanillas`);
    const params = paramsFrom(i);
    return { parametros: { lambda: params.lambda, mu: params.mu, cs: params.cs, cw: params.cw, espera_max_min: round(params.wqMaxH * 60, 3) }, ...metrics(mmc(i.ventanillas, params)) };
  },
  optimizar(input, chip) {
    const i = check(input, PARAM_SPEC);
    chip('Resolviendo el modelo de optimización');
    const params = { ...paramsFrom(i), ...WIDE };
    const o = optimize(params);
    if (o.status !== 'Optimal') return { estado: 'Sin solución factible', detalle: 'Ningún número de ventanillas entre 1 y 80 cumple el límite de espera con estos datos.' };
    const near = o.all.filter((s) => Math.abs(s.c - o.x) <= 2).map(metrics);
    return { estado: 'Óptimo', ventanillas_optimas: o.x, costo_total_usd_h: round(o.y, 2), minimo_que_cumple_limite: o.xSla, optimo: metrics(o.best), escenarios_vecinos: near };
  },
  rango_optimalidad(input, chip) {
    const i = check(input, { parametro: ['enum', ['mu', 'cw', 'cs', 'wq', 'lambda'], 0, true] });
    const def = paramDef(i.parametro);
    chip(`Analizando la sensibilidad de ${def.sym}`);
    const x0 = optimize(P).x;
    const r = optimalityRange(P, def, x0);
    const edge = (e) => (e.value == null ? 'no cambia dentro del rango estudiado' : { valor: round(e.value, 3), nuevo_optimo_fuera: e.x });
    return { parametro: def.label, unidad: def.unit, valor_enunciado: r.base, optimo_enunciado: x0, rango_estudiado: [def.min, def.max], limite_inferior: edge(r.low), limite_superior: edge(r.high) };
  },
  simular(input, chip) {
    const i = check(input, { ventanillas: ['int', 1, 80, true], lambda: ['num', 1, 2000], mu: ['num', 1, 200], horas: ['num', 1, 24], replicas: ['int', 2, 30] });
    const params = paramsFrom(i);
    if (params.lambda / params.mu >= i.ventanillas) return { error: 'Sistema inestable (λ ≥ c·μ): la cola crece sin límite y no tiene sentido simular un promedio.' };
    chip(`Simulando ${i.replicas ?? 10} réplicas con ${i.ventanillas} ventanillas`);
    const s = simulate({ c: i.ventanillas, lambda: params.lambda, mu: params.mu, cs: params.cs, cw: params.cw, wqMaxH: params.wqMaxH, hours: i.horas ?? 8, replications: i.replicas ?? 10 });
    const model = mmc(i.ventanillas, params);
    return {
      replicas: s.replications,
      horas_por_replica: i.horas ?? 8,
      pasajeros_promedio: round(s.passengers, 0),
      Wq_segundos: round(s.wq * 3600, 2),
      Wq_ic95_semiancho_segundos: round(s.wqHalfWidth * 3600, 2),
      prob_esperar_pct: round(s.pWait * 100, 2),
      supera_limite_pct: round(s.pOverSla * 100, 2),
      espera_maxima_minutos: round(s.maxWait * 60, 2),
      costo_total_usd_h: round(s.cost, 2),
      modelo_analitico: { Wq_segundos: round(model.Wq * 3600, 2), costo_total_usd_h: round(model.totalCost, 2) },
    };
  },
  ir_a_seccion(input, chip) {
    const i = check(input, { seccion: ['enum', Object.keys(SECTION_NAMES), 0, true] });
    chip(`Abriendo «${SECTION_NAMES[i.seccion]}»`);
    document.getElementById(i.seccion)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (matchMedia('(max-width: 640px)').matches) setOpen(false); // en móvil el panel tapa la página
    return { ok: true, seccion: SECTION_NAMES[i.seccion] };
  },
  configurar_gemelo(input, chip) {
    const i = check(input, { ventanillas: ['int', 12, 20], lambda: ['int', 120, 240], iniciar: ['bool'] });
    const twin = use('gemelo');
    if (!twin) return { error: 'El gemelo digital no está disponible en esta página.' };
    chip('Configurando el gemelo digital');
    document.getElementById('gemelo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (matchMedia('(max-width: 640px)').matches) setOpen(false);
    return { ok: true, estado: twin.configure(i) };
  },

  // ---- Acciones que modifican la app ----
  estado_app(input, chip) {
    check(input, {});
    chip('Revisando el estado de la app');
    return use('app')?.state() ?? { error: 'Estado no disponible.' };
  },
  aplicar_escenario(input, chip) {
    const i = check(input, { ...PARAM_SPEC, nombre: ['str'] });
    const app = use('app');
    if (!app) return { error: 'No disponible.' };
    chip(`Recalculando la app${i.nombre ? ` · ${i.nombre}` : ''}`);
    closeOnMobile();
    return app.apply({ lambda: i.lambda, mu: i.mu, cs: i.costo_ventanilla, cw: i.costo_espera, wqMin: i.espera_max_min }, i.nombre ?? '');
  },
  restaurar_enunciado(input, chip) {
    check(input, {});
    chip('Volviendo al escenario base');
    return use('app')?.restore() ?? { error: 'No disponible.' };
  },
  agregar_a_comparador(input, chip) {
    const i = check(input, { nombre: ['str', 0, 0, true], ...PARAM_SPEC, ventanillas: ['int', 1, 80] });
    const cmp = use('comparador');
    if (!cmp) return { error: 'El comparador no está disponible.' };
    chip(`Agregando «${i.nombre}» al comparador`);
    const { row, sol } = cmp.add({ nombre: i.nombre, lambda: i.lambda, mu: i.mu, cs: i.costo_ventanilla, cw: i.costo_espera, wqMin: i.espera_max_min, x: i.ventanillas });
    document.getElementById('comparador')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    closeOnMobile();
    return sol.m ? { ok: true, nombre: row.nombre, ...metrics(sol.m), ventanillas_fijadas: sol.fixed } : { ok: true, nombre: row.nombre, resultado: 'Sin solución factible con estos datos.' };
  },
  quitar_del_comparador(input, chip) {
    const i = check(input, { nombre: ['str'] });
    chip(i.nombre ? `Quitando «${i.nombre}» del comparador` : 'Vaciando el comparador');
    return { ok: true, eliminados: use('comparador')?.remove(i.nombre) ?? 0 };
  },
  ajustar_sensibilidad(input, chip) {
    const i = check(input, { parametro: ['enum', ['mu', 'cw', 'cs', 'wq', 'lambda'], 0, true], valor: ['num', -1e6, 1e6] });
    const sens = use('sensibilidad');
    if (!sens) return { error: 'La sección de sensibilidad no está disponible.' };
    chip('Ajustando el análisis de sensibilidad');
    document.getElementById('sensibilidad')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    closeOnMobile();
    return { ok: true, ...sens.set(i) };
  },
  ejecutar_simulacion(input, chip) {
    const i = check(input, { ventanillas: ['int', 1, 80, true], horas: ['num', 1, 24], replicas: ['int', 2, 30], semilla: ['int', 1, 1e9] });
    const simApi = use('simulacion');
    if (!simApi) return { error: 'La sección de simulación no está disponible.' };
    chip(`Ejecutando la simulación con ${i.ventanillas} ventanillas`);
    document.getElementById('simulacion')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    closeOnMobile();
    const run = simApi.run(i);
    if (!run) return { error: 'No se pudo ejecutar la simulación.' };
    const { r, theo, covers } = run;
    return {
      ok: true, ventanillas: run.c, horas: run.hours, replicas: run.replications, semilla: run.seed,
      Wq_segundos: round(r.wq * 3600, 2), Wq_ic95_semiancho_segundos: round(r.wqHalfWidth * 3600, 2),
      prob_esperar_pct: round(r.pWait * 100, 2), costo_total_usd_h: round(r.cost, 2),
      modelo: { Wq_segundos: round(theo.Wq * 3600, 2), costo_total_usd_h: round(theo.totalCost, 2) },
      ic_contiene_modelo: covers,
    };
  },
};
const closeOnMobile = () => matchMedia('(max-width: 640px)').matches && setOpen(false);

// ---- Resolvedor general de colas ----
const SOLVER_SPEC = {
  modelo: ['enum', Object.keys(MODELS), 0, true], titulo: ['str'], unidad: ['enum', ['hora', 'minuto', 'dia', 'semana']],
  lambda: ['num', 1e-9, 1e9, true], mu: ['num', 1e-9, 1e9, true], servidores: ['int', 1, 1000], capacidad: ['int', 1, 5000], poblacion: ['int', 1, 5000],
  sigma: ['num', 0, 1e9], fases: ['int', 1, 1000], costo_servidor: ['num', 0, 1e9], costo_espera: ['num', 0, 1e9], costo_base: ['enum', ['Lq', 'L']],
  costo_rechazo: ['num', 0, 1e9], optimizar_servidores: ['bool'], c_min: ['int', 1, 200], c_max: ['int', 1, 200], espera_max: ['num', 0, 1e9], bloqueo_max: ['num', 0, 1],
};
const toSpec = (i) => ({
  modelo: i.modelo, titulo: i.titulo, unidad: i.unidad ?? 'hora', lambda: i.lambda, mu: i.mu, c: i.servidores, K: i.capacidad, N: i.poblacion,
  sigma: i.sigma, k: i.fases, cs: i.costo_servidor, cw: i.costo_espera, base: i.costo_base, cr: i.costo_rechazo,
  optimizar: i.optimizar_servidores, cMin: i.c_min, cMax: i.c_max, maxWq: i.espera_max, maxBlock: i.bloqueo_max,
});
Object.assign(TOOLS, {
  resolver_cola(input, chip) {
    const i = check(input, SOLVER_SPEC);
    chip(`Resolviendo ${MODELS[i.modelo].kendall}`);
    return summarize(runSpec(toSpec(i)));
  },
  mostrar_en_resolvedor(input, chip) {
    const i = check(input, SOLVER_SPEC);
    const spec = toSpec(i);
    const page = use('resolvedor');
    if (page) {
      chip(`Cargando ${MODELS[i.modelo].kendall} en el resolvedor`);
      closeOnMobile();
      return page.load(spec);
    }
    // En la página principal: se abre el resolvedor al terminar la respuesta
    chip(`Preparando el resolvedor (${MODELS[i.modelo].kendall})`);
    pendingNav = `resolver.html${specToHash(spec)}`;
    return { ...summarize(runSpec(spec)), se_abrira_el_resolvedor: 'Al terminar tu respuesta, la app abrirá la página del resolvedor con este ejercicio cargado.' };
  },
});

// ---------- Markdown mínimo y seguro (+ fórmulas con KaTeX) ----------
// KaTeX se descarga al abrir el asistente, no con la página
let katex = null;
let katexLoading = null;
const loadKatex = () =>
  (katexLoading ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')])
    .then(([m]) => (katex = m.default))
    .catch(() => {}));

function renderMarkdown(src) {
  const stash = [];
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;
  const math = (tex, display) => {
    try {
      if (!katex) throw new Error('KaTeX aún no cargó');
      return katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: 'ignore', output: 'html' });
    } catch {
      return `<code>${escapeHtml(tex)}</code>`;
    }
  };
  let s = src
    .replace(/```[\w-]*\n?([\s\S]*?)(?:```|$)/g, (_, code) => keep(`<pre class="as-pre"><code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`))
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => keep(math(t.trim(), true)))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => keep(math(t.trim(), true)))
    .replace(/\\\((.+?)\\\)/g, (_, t) => keep(math(t, false)))
    // $...$ en línea: no empieza con dígito ni espacio (así "$801,07" sigue siendo un monto)
    .replace(/\$(?![\s\d])([^$\n]+?)(?<!\s)\$(?!\d)/g, (_, t) => keep(math(t, false)))
    .replace(/`([^`\n]+)`/g, (_, c) => keep(`<code>${escapeHtml(c)}</code>`));

  const inline = (t) =>
    escapeHtml(t)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  const lines = s.split('\n');
  const out = [];
  let para = [];
  const flush = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      flush();
      out.push(`<p class="as-h">${inline(h[1])}</p>`);
      continue;
    }
    // tabla: | a | b |  seguida de |---|---|
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[k + 1] ?? '')) {
      flush();
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      k++;
      const rows = [];
      while (k + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[k + 1])) rows.push(cells(lines[++k]));
      out.push(
        `<div class="as-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      );
      continue;
    }
    const li = line.match(/^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/);
    if (li) {
      flush();
      const ordered = !li[1];
      const items = [li[3]];
      while (k + 1 < lines.length) {
        const next = lines[k + 1].match(/^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/);
        if (!next || !next[1] !== ordered) break;
        items.push(next[3]);
        k++;
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (/^\s*\u0000\d+\u0000\s*$/.test(line)) {
      flush();
      out.push(line.trim());
      continue;
    }
    para.push(line);
  }
  flush();
  return out.join('').replace(/\u0000(\d+)\u0000/g, (_, n) => stash[Number(n)]);
}

// ---------- Interfaz ----------
let root;
let panel;
let log;
let input;
let sendBtn;
let open = false;
let busy = false;
let controller = null;
let thinkingRow = null;
let messages = []; // conversación en el formato de la API
let pendingNav = null; // página a abrir cuando termine la respuesta
let page = 'principal';
let embedded = false; // incrustado en la página (resolvedor) en lugar de flotante
const STORE = 'optiqueue.chat';

// La conversación sobrevive a recargas y al cambio de página (solo en esta pestaña)
function persist(extra = {}) {
  try {
    sessionStorage.setItem(STORE, JSON.stringify({ messages, open, ...extra }));
  } catch {
    /* sin almacenamiento o conversación muy grande: no se guarda */
  }
}
function restore() {
  let saved;
  try {
    saved = JSON.parse(sessionStorage.getItem(STORE) ?? 'null');
  } catch {
    return false;
  }
  if (!Array.isArray(saved?.messages) || !saved.messages.length) return false;
  messages = saved.messages;
  log.innerHTML = '';
  for (const m of messages) {
    if (m.role === 'user' && typeof m.content === 'string') addBubble('user', escapeHtml(m.content).replace(/\n/g, '<br>'));
    else if (m.role === 'assistant') {
      for (const b of m.content) {
        if (b.type === 'text' && b.text.trim()) addBubble('bot', renderMarkdown(b.text));
        else if (b.type === 'tool_use') finishChip(addChip(TOOL_LABELS[b.name] ?? b.name), true);
      }
    }
  }
  return saved.open || saved.reopen;
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function setOpen(v) {
  if (embedded) {
    // siempre visible; «abrir» solo prepara KaTeX
    if (v) loadKatex();
    return;
  }
  open = v;
  root.dataset.open = String(v);
  panel.dataset.open = String(v);
  panel.setAttribute('aria-hidden', String(!v));
  panel.inert = !v;
  const fab = root.querySelector('[data-as-fab]');
  fab.setAttribute('aria-expanded', String(v));
  fab.setAttribute('aria-label', v ? 'Cerrar el asistente' : 'Abrir el asistente con IA');
  hideNudge();
  persist();
  if (v) {
    loadKatex();
    setTimeout(() => input.focus(), 320);
  }
}

const scrollDown = () => {
  log.scrollTo({ top: log.scrollHeight, behavior: reduced() ? 'auto' : 'smooth' });
};

/** Fila de mensaje. Las del asistente llevan su avatar al lado. */
function addBubble(role, html = '') {
  const row = document.createElement('div');
  row.className = `as-row as-row-${role}`;
  const bubble = document.createElement('div');
  bubble.className = role === 'user' ? 'as-msg as-user' : 'as-msg as-bot';
  bubble.innerHTML = html;
  if (role === 'bot') row.innerHTML = '<span class="as-mini-orb" aria-hidden="true"><i data-lucide="sparkles"></i></span>';
  row.appendChild(bubble);
  hideThinking();
  log.appendChild(row);
  refreshIcons();
  scrollDown();
  return bubble;
}

/** Indicador «pensando» mientras llega la respuesta. */
function showThinking(label = 'Pensando') {
  hideThinking();
  thinkingRow = document.createElement('div');
  thinkingRow.className = 'as-row as-row-bot';
  thinkingRow.innerHTML = `<span class="as-mini-orb is-thinking" aria-hidden="true"><i data-lucide="sparkles"></i></span>
    <div class="as-thinking"><span class="as-dots"><span></span><span></span><span></span></span><span class="as-shimmer">${label}…</span></div>`;
  log.appendChild(thinkingRow);
  refreshIcons();
  scrollDown();
}
function hideThinking() {
  thinkingRow?.remove();
  thinkingRow = null;
}

function addChip(text) {
  const el = document.createElement('div');
  el.className = 'as-chip is-running';
  el.innerHTML = `<span class="as-chip-ico"><i data-lucide="wrench"></i></span><span>${escapeHtml(text)}</span>`;
  hideThinking();
  log.appendChild(el);
  refreshIcons();
  scrollDown();
  return el;
}
function finishChip(el, ok) {
  if (!el) return;
  el.classList.remove('is-running');
  el.classList.add(ok ? 'is-done' : 'is-failed');
  el.querySelector('.as-chip-ico').innerHTML = `<i data-lucide="${ok ? 'check' : 'x'}"></i>`;
  refreshIcons();
}

function addNotice(text, kind = 'error') {
  hideThinking();
  const el = document.createElement('div');
  el.className = `as-notice as-notice-${kind}`;
  el.textContent = text;
  log.appendChild(el);
  scrollDown();
}

function setBusy(v) {
  busy = v;
  root.dataset.busy = String(v);
  sendBtn.innerHTML = (v ? '<i data-lucide="square"></i>' : '<i data-lucide="send-horizontal"></i>') + (embedded ? `<span class="as-send-label">${v ? 'Detener' : 'Resolver'}</span>` : '');
  sendBtn.setAttribute('aria-label', v ? 'Detener respuesta' : 'Enviar pregunta');
  if (!v) hideThinking();
  refreshIcons();
}

/** Una llamada al modelo con respuesta en vivo. Devuelve { content, stop_reason }. */
async function callModel(signal) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = `No se pudo contactar al asistente (${res.status}).`;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {}
    throw new Error(msg);
  }
  let bubble = null;
  let text = '';
  let raf = 0;
  const paint = () => {
    raf = 0;
    bubble.innerHTML = renderMarkdown(text);
    scrollDown();
  };
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  let done = null;
  try {
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      buf += value;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.t === 'text') {
          if (!bubble) {
            bubble = addBubble('bot');
            bubble.classList.add('is-streaming');
          }
          text += ev.d;
          if (!raf) raf = requestAnimationFrame(paint);
        } else if (ev.t === 'done') done = ev;
        else if (ev.t === 'error') throw new Error(ev.message);
      }
    }
  } finally {
    if (raf) cancelAnimationFrame(raf);
    if (bubble) {
      paint();
      bubble.classList.remove('is-streaming');
    }
  }
  if (!done) throw new Error('La respuesta se cortó antes de terminar. Inténtalo de nuevo.');
  return done;
}

async function ask(question) {
  if (busy || !question.trim()) return;
  const hello = root.querySelector('[data-as-welcome]');
  if (hello) {
    hello.classList.add('is-leaving');
    setTimeout(() => hello.remove(), reduced() ? 0 : 220);
  }
  addBubble('user', escapeHtml(question).replace(/\n/g, '<br>'));
  const startLen = messages.length;
  messages.push({ role: 'user', content: question.trim() });
  controller = new AbortController();
  setBusy(true);
  showThinking();
  try {
    await loadKatex();
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const reply = await callModel(controller.signal);
      messages.push({ role: 'assistant', content: reply.content });
      const uses = reply.content.filter((b) => b.type === 'tool_use');
      if (reply.stop_reason === 'refusal') {
        addNotice('El asistente no puede ayudar con esa solicitud. Prueba con una pregunta sobre el proyecto.', 'info');
        break;
      }
      if (reply.stop_reason === 'max_tokens' && uses.length) {
        addNotice('La respuesta se cortó por su longitud. Pide algo más acotado.', 'info');
        break;
      }
      if (reply.stop_reason !== 'tool_use' || !uses.length) break;
      // Todas las herramientas del turno, y sus resultados juntos en un solo mensaje
      const results = [];
      for (const u of uses) {
        const fn = TOOLS[u.name];
        let chip = null;
        try {
          if (!fn) throw new ToolInputError(`Herramienta desconocida: ${u.name}.`);
          const out = fn(u.input, (label) => (chip = addChip(label)));
          finishChip(chip, !out?.error);
          results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) });
        } catch (err) {
          finishChip(chip, false);
          results.push({ type: 'tool_result', tool_use_id: u.id, content: `Error: ${err.message}`, is_error: true });
        }
      }
      messages.push({ role: 'user', content: results });
      if (turn === MAX_TURNS - 1) addNotice('El asistente necesitó demasiados pasos. Reformula la pregunta.', 'info');
      else showThinking('Analizando los resultados');
    }
  } catch (err) {
    if (err.name === 'AbortError') addNotice('Respuesta detenida.', 'info');
    else {
      addNotice(err.message || 'Ocurrió un error inesperado.');
      // si no llegó a responder nada, la pregunta no queda en la conversación
      if (messages.length === startLen + 1) {
        messages.length = startLen;
        input.value ||= question;
      }
    }
    // la conversación no puede terminar en una llamada a herramienta sin resultado
    const last = messages.at(-1);
    if (last?.role === 'assistant' && last.content.some((b) => b.type === 'tool_use')) messages.pop();
  } finally {
    controller = null;
    setBusy(false);
    persist();
    if (pendingNav) {
      const url = pendingNav;
      pendingNav = null;
      persist({ reopen: true });
      addNotice('Abriendo el resolvedor…', 'info');
      setTimeout(() => (location.href = url), reduced() ? 0 : 900);
    }
  }
}

function reset() {
  controller?.abort();
  messages = [];
  persist();
  log.innerHTML = '';
  log.appendChild(welcome());
  refreshIcons();
  input.focus();
}

function welcome() {
  const el = document.createElement('div');
  el.dataset.asWelcome = '';
  el.className = 'as-welcome';
  if (embedded) {
    el.classList.add('as-welcome-compact');
    el.innerHTML = `
      <p class="as-sugg-label">Ejemplos de enunciados</p>
      <div class="as-sugg">
        ${SUGGESTIONS[page].map(([icon, q], i) => `<button type="button" class="as-suggest" data-as-suggest style="--i:${i}"><span class="as-suggest-ico"><i data-lucide="${icon}"></i></span><span data-q>${escapeHtml(q)}</span></button>`).join('')}
      </div>`;
    return el;
  }
  el.innerHTML = `
    <div class="as-hero" aria-hidden="true">
      <span class="as-hero-ring"></span><span class="as-hero-ring as-hero-ring-2"></span>
      <span class="as-hero-orb"><i data-lucide="sparkles"></i></span>
      <span class="as-spark as-spark-1"></span><span class="as-spark as-spark-2"></span><span class="as-spark as-spark-3"></span>
    </div>
    <p class="as-hello">Hola, soy tu asistente de colas</p>
    <p class="as-hello-sub">${
      page === 'resolvedor'
        ? 'Pégame cualquier ejercicio de colas: identifico el modelo, convierto las unidades, lo cargo en el resolvedor y te explico cada resultado.'
        : 'Te explico el modelo M/M/c, pruebo otros escenarios, comparo con la simulación, resuelvo otros ejercicios y te llevo a la parte de la app que necesites.'
    }</p>
    <p class="as-sugg-label">Prueba con</p>
    <div class="as-sugg">
      ${SUGGESTIONS[page].map(([icon, q], i) => `<button type="button" class="as-suggest" data-as-suggest style="--i:${i}"><span class="as-suggest-ico"><i data-lucide="${icon}"></i></span><span data-q>${escapeHtml(q)}</span><i data-lucide="arrow-right" class="as-suggest-go"></i></button>`).join('')}
    </div>`;
  return el;
}

// Burbuja que invita a usar el asistente (una sola vez por visita)
let nudgeTimer = 0;
function hideNudge() {
  clearTimeout(nudgeTimer);
  root?.querySelector('[data-as-nudge]')?.classList.remove('is-visible');
}

/**
 * ¿Está activo el asistente? El servidor lo decide (variable ASISTENTE_IA y clave configurada).
 * Si no responde (por ejemplo, en un hosting estático), se asume que no.
 */
export async function assistantAvailable() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(ENDPOINT, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    return res.ok && (await res.json()).habilitado === true;
  } catch {
    return false;
  }
}

export function renderAssistant({ page: pageName = 'principal', mount = null } = {}) {
  page = SUGGESTIONS[pageName] ? pageName : 'principal';
  embedded = !!mount;
  root = document.createElement('div');
  root.className = embedded ? 'as-root as-embedded' : 'as-root';
  root.dataset.open = embedded ? 'true' : 'false';
  const head = embedded
    ? `<header class="as-head">
        <span class="as-avatar" aria-hidden="true"><i data-lucide="sparkles"></i></span>
        <div class="relative flex-1 min-w-0">
          <p class="as-title">Resolver un enunciado con IA</p>
          <p class="as-status"><span class="as-live-dot"></span><span data-as-status>Identifica el modelo, convierte las unidades y carga el ejercicio en esta página</span></p>
        </div>
        <button type="button" class="as-icon-btn" data-as-reset aria-label="Nueva conversación" title="Nueva conversación"><i data-lucide="rotate-ccw"></i></button>
      </header>`
    : `<header class="as-head">
        <span class="as-aurora as-aurora-1" aria-hidden="true"></span><span class="as-aurora as-aurora-2" aria-hidden="true"></span>
        <span class="as-avatar" aria-hidden="true"><span class="as-avatar-ring"></span><i data-lucide="bot"></i></span>
        <div class="relative flex-1 min-w-0">
          <p class="as-title">Asistente OptiQueue</p>
          <p class="as-status"><span class="as-live-dot"></span><span data-as-status>En línea · Claude</span></p>
        </div>
        <button type="button" class="as-icon-btn max-sm:hidden" data-as-size aria-label="Agrandar el panel" title="Agrandar"><i data-lucide="maximize-2"></i></button>
        <button type="button" class="as-icon-btn" data-as-reset aria-label="Nueva conversación" title="Nueva conversación"><i data-lucide="trash-2"></i></button>
        <button type="button" class="as-icon-btn" data-as-close aria-label="Cerrar el asistente" title="Cerrar"><i data-lucide="x"></i></button>
      </header>`;
  const fab = embedded
    ? ''
    : `<div class="as-nudge" data-as-nudge aria-hidden="true">
      <span class="as-nudge-wave">👋</span> ¿Dudas con el modelo? <strong>Pregúntame</strong>
    </div>
    <button type="button" class="as-fab" data-as-fab aria-controls="asPanel" aria-expanded="false" aria-label="Abrir el asistente con IA">
      <span class="as-fab-aura" aria-hidden="true"></span>
      <span class="as-fab-orb" aria-hidden="true">
        <i data-lucide="sparkles" class="as-ico-open"></i>
        <i data-lucide="x" class="as-ico-close"></i>
      </span>
      <span class="as-fab-text">
        <span class="as-fab-title">Asistente IA</span>
        <span class="as-fab-sub"><span class="as-live-dot"></span>Pregúntame sobre el modelo</span>
      </span>
    </button>`;
  root.innerHTML = `
    ${fab}
    <section id="asPanel" class="as-panel" ${embedded ? 'aria-label="Asistente con IA"' : 'role="dialog" aria-label="Asistente con IA" aria-hidden="true"'} data-open="${embedded}" data-size="md">
      ${head}
      <div class="as-log" data-as-log aria-live="polite"></div>
      <form class="as-form" data-as-form>
        <div class="as-compose">
          <textarea rows="${embedded ? 3 : 1}" class="as-input" data-as-input placeholder="${embedded ? 'Pega aquí el enunciado completo del ejercicio o haz una pregunta…' : 'Escribe tu pregunta…'}" aria-label="Tu pregunta" maxlength="4000"></textarea>
          <button type="submit" class="as-send" data-as-send aria-label="Enviar pregunta"><i data-lucide="send-horizontal"></i>${embedded ? '<span class="as-send-label">Resolver</span>' : ''}</button>
        </div>
        <p class="as-foot">Enter para enviar · Shift + Enter para salto de línea · La IA puede equivocarse: verifica las cifras.</p>
      </form>
    </section>`;
  (mount ?? document.body).appendChild(root);

  panel = root.querySelector('.as-panel');
  log = root.querySelector('[data-as-log]');
  input = root.querySelector('[data-as-input]');
  sendBtn = root.querySelector('[data-as-send]');
  panel.inert = !embedded;
  let hasSaved = false;
  try {
    hasSaved = !!JSON.parse(sessionStorage.getItem(STORE) ?? 'null')?.messages?.length;
  } catch {}
  if (!hasSaved) log.appendChild(welcome());
  else
    // las fórmulas de la conversación guardada necesitan KaTeX antes de dibujarse
    loadKatex().then(() => {
      if (restore()) setOpen(true);
      if (!messages.length) log.appendChild(welcome());
      refreshIcons();
    });

  root.querySelector('[data-as-fab]')?.addEventListener('click', () => setOpen(!open));
  root.querySelector('[data-as-close]')?.addEventListener('click', () => setOpen(false));
  root.querySelector('[data-as-reset]').addEventListener('click', reset);
  root.querySelector('[data-as-size]')?.addEventListener('click', (e) => {
    const big = panel.dataset.size !== 'lg';
    panel.dataset.size = big ? 'lg' : 'md';
    const btn = e.currentTarget;
    btn.innerHTML = `<i data-lucide="${big ? 'minimize-2' : 'maximize-2'}"></i>`;
    btn.setAttribute('aria-label', big ? 'Reducir el panel' : 'Agrandar el panel');
    btn.title = big ? 'Reducir' : 'Agrandar';
    refreshIcons();
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && open && setOpen(false));
  log.addEventListener('click', (e) => {
    const b = e.target.closest('[data-as-suggest]');
    if (b) ask(b.querySelector('[data-q]').textContent);
  });
  let grow = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
    root.querySelector('.as-compose').classList.toggle('has-text', !!input.value.trim());
  };
  if (embedded) grow = () => root.querySelector('.as-compose').classList.toggle('has-text', !!input.value.trim());
  input.addEventListener('input', grow);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      root.querySelector('[data-as-form]').requestSubmit();
    }
  });
  root.querySelector('[data-as-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) {
      controller?.abort();
      return;
    }
    const q = input.value;
    if (!q.trim()) return;
    input.value = '';
    grow();
    sendBtn.classList.remove('is-sent');
    void sendBtn.offsetWidth;
    sendBtn.classList.add('is-sent');
    ask(q);
  });
  refreshIcons();

  // otras partes de la página pueden abrir el chat y hacer una pregunta
  provide('asistente', {
    open: () => setOpen(true),
    ask(q) {
      setOpen(true);
      if (embedded) root.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
      return ask(q);
    },
  });

  // invitación discreta a los pocos segundos, solo si no se abrió el chat
  if (!embedded) nudgeTimer = setTimeout(() => {
    if (open) return;
    const n = root.querySelector('[data-as-nudge]');
    n.classList.add('is-visible');
    nudgeTimer = setTimeout(hideNudge, 7000);
  }, 6000);
}
