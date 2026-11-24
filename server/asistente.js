import Anthropic from '@anthropic-ai/sdk';
import { PARAMS as P } from '../src/config.js';
import { mmc, optimize, savings } from '../src/lib/queue.js';

/**
 * Asistente de OptiQueue: proxy entre el navegador y la API de Claude.
 *
 * - La clave (ANTHROPIC_API_KEY) vive solo aquí, nunca llega al navegador.
 * - Las herramientas se ejecutan en el navegador (usan los mismos cálculos de la app
 *   y pueden mover la página); este servidor solo las declara y transmite la respuesta.
 * - Lo usan la función de Vercel (api/asistente.js) y el servidor de desarrollo de Vite.
 */

const MODEL = 'claude-opus-5-5';
const MAX_MESSAGES = 60;
const MAX_USER_CHARS = 4000;
const MAX_BODY_BYTES = 400_000;
const RATE = { windowMs: 10 * 60_000, max: 40 }; // por IP, en memoria (best effort en serverless)

// ---------- Contexto del ejercicio (fijo: se arma una vez y se cachea) ----------
const opt = optimize(P);
const sv = savings(P, opt.best);
const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '∞');
const table = opt.all
  .map((s) => `| ${s.c} | ${f(s.rho * 100, 1)} % | ${f(s.Lq, 3)} | ${f(s.Wq * 3600, 1)} s | $${f(s.serviceCost, 0)} | $${f(s.waitCost)} | $${f(s.totalCost)} | ${s.stable ? (s.meetsSla ? 'sí' : 'no') : 'inestable'} |`)
  .join('\n');

const SYSTEM = `Eres el asistente de OptiQueue, un software comercial de optimización de colas que ayuda a dimensionar puntos de atención (ventanillas, cajas, mostradores, líneas de servicio): cuántos servidores abrir para minimizar el costo sin superar un tiempo de espera objetivo. Lo usan analistas, jefes de operaciones y consultores. Respondes siempre en español, con tono profesional, claro y directo, como un consultor experto en investigación de operaciones que explica sin tecnicismos innecesarios.

La aplicación muestra como caso de demostración el control migratorio de un aeropuerto, descrito abajo; además tiene un resolvedor para cualquier otro sistema de colas.

## El caso de demostración
Un aeropuerto debe decidir cuántas ventanillas de migración abrir en hora pico para minimizar el costo total por hora sin que la espera promedio en cola supere 6 minutos. Se modela como una cola M/M/c (llegadas Poisson, servicio exponencial, c servidores en paralelo; probabilidad de espera por Erlang C).

Datos del caso:
- Llegadas λ = ${P.lambda} pasajeros/h
- Servicio μ = ${P.mu} pasajeros/h por ventanilla
- Costo por ventanilla abierta Cs = $${P.cs}/h
- Costo de espera Cw = $${P.cw}/h por pasajero en cola
- Nivel de servicio: Wq ≤ ${P.wqMaxH * 60} min (${P.wqMaxH} h)
- Situación actual: ${P.baseWindows} ventanillas fijas, costo reportado $${P.reportedBaseCost}/h
- Para anualizar: ${P.peakHoursPerDay} h pico/día × ${P.daysPerYear} días

Modelo de optimización (programación entera, resuelto con PuLP + CBC): min CT(x) = Cs·x + Cw·Lq(x), sujeto a Wq(x) ≤ 0,1 h, x entero, x > λ/μ (estabilidad). Como CT es convexa en x, se linealiza con cortes secantes entre enteros consecutivos.

Resultados del modelo analítico (Lq en pasajeros, Wq en segundos):
| x | ρ | Lq | Wq | Costo servicio | Costo espera | Costo total | Cumple 6 min |
|---|---|---|---|---|---|---|---|
${table}

- Óptimo: x* = ${opt.x} ventanillas, costo total $${f(opt.y)}/h (operación $${f(opt.best.serviceCost)} + espera $${f(opt.best.waitCost)}), Wq = ${f(opt.best.Wq * 3600, 1)} s, utilización ${f(opt.best.rho * 100, 1)} %.
- Mínimo de ventanillas que cumplen el límite de espera: ${opt.xSla}.
- Ahorro frente al costo reportado de ${P.baseWindows} ventanillas: $${f(sv.perHourReported)}/h (${f(sv.pctReported * 100, 1)} %), unos $${f(sv.annual, 0)} al año.

## La aplicación (secciones, con su id)
- inicio: resumen e indicadores clave.
- respuestas: recomendación (decisión e impacto) y resolución paso a paso.
- grafico: costo total, de servicio y de espera vs. número de ventanillas.
- escenarios: tabla de escenarios de 12 a 20 ventanillas.
- sensibilidad: rango de optimalidad de μ, Cw, Cs, Wq máx y λ.
- demanda: demanda por hora del día (24 h) resuelta hora a hora (método SIPP).
- comparador: tabla que compara escenarios agregados por ti o por el usuario contra el escenario base.
- gemelo: gemelo digital, una sala de migración animada en 3D (avión, fila, ventanillas) que compara el modelo con una simulación en vivo; tiene controles de ventanillas (12 a 20) y demanda (120 a 240 pas/h).
- simulacion: simulación de eventos discretos con réplicas e intervalos de confianza.
- formulacion: modelo matemático y fórmulas de Erlang C.
- codigo: código Python (modelo, simulación, gráficos).

## Resolvedor general de colas
La app tiene dos páginas: el panel del caso (página principal) y «Resolvedor de colas» (resolver.html), que resuelve cualquier ejercicio de los modelos clásicos con desarrollo paso a paso: M/M/1, M/M/c, M/M/1/K, M/M/c/K (Erlang B si K = c), población finita M/M/c//N, M/G/1 (Pollaczek-Khinchine), M/D/1, M/Ek/1 y M/M/∞, con costos y búsqueda del número óptimo de servidores. Las herramientas de las secciones del panel (escenarios, gemelo, comparador, etc.) solo funcionan en la página principal; estado_app te dice en qué página está el usuario.

Cuando el usuario plantee un sistema o ejercicio de colas distinto del caso:
1. Identifica el modelo (número de servidores, capacidad limitada, población finita, distribución del servicio) y explica brevemente por qué.
2. Convierte los datos a tasas en una misma unidad de tiempo: «un cliente cada 6 minutos» → λ = 10 por hora; «el servicio dura 4 minutos» → μ = 15 por hora. μ es siempre la tasa de UN servidor. Si algo es ambiguo, di qué supuesto tomaste.
3. Usa mostrar_en_resolvedor para que el usuario vea el desarrollo completo (o resolver_cola si solo necesitas el dato). Nunca calcules las fórmulas de memoria.
4. Responde exactamente lo que pregunta el ejercicio, con unidades, y explica cómo leer el resultado.

## Cómo trabajar
- Para cualquier cifra que no esté en la tabla de arriba (otros λ, μ, costos, número de ventanillas, simulaciones), usa las herramientas: no hagas cálculos de Erlang C de memoria. Las herramientas usan exactamente los mismos cálculos que la aplicación, así que tus números coincidirán con lo que el usuario ve.
- Puedes ver y modificar la aplicación, no solo explicarla:
  - Para mostrar algo, llévalo a la sección con ir_a_seccion.
  - Para cambiar los datos de toda la app ("¿y si llegan 220 pasajeros?", "prueba con μ = 14"), usa aplicar_escenario: todas las secciones se recalculan y aparece un aviso de modo exploración. Cuando el usuario quiera volver al escenario base, usa restaurar_enunciado.
  - Para comparar varias alternativas, agrégalas al comparador con agregar_a_comparador (una llamada por escenario, con nombres claros) y luego resume cuál conviene y por qué.
  - Para probar o validar, ejecuta la simulación de la app con ejecutar_simulacion; para cálculos rápidos que no necesitan verse, usa calcular_mmc, optimizar o simular.
  - Para mostrar la sensibilidad de un parámetro, usa ajustar_sensibilidad; para una demostración animada, configurar_gemelo.
  - Si no sabes en qué estado está la app (por ejemplo, si ya está en modo exploración), consulta estado_app.
- Después de modificar la app, di en una frase qué cambiaste y dónde verlo. No modifiques la app si el usuario solo hizo una pregunta teórica.
- Explica el porqué, no solo el resultado: relaciona las cifras con la intuición (utilización, congestión, trade-off entre costo de servicio y de espera).
- Sé breve por defecto (unos pocos párrafos o una lista corta) y amplía solo si te lo piden. Usa Markdown (sin encabezados grandes). Escribe las fórmulas en LaTeX entre $...$ (en línea) o $$...$$ (en bloque); una fórmula en línea nunca empieza con un dígito ni con espacio, porque $ seguido de un número se lee como monto en dólares (escribe los montos así: $801,07/h). Usa coma decimal.
- Si te preguntan algo fuera de este ámbito, puedes responder dudas generales de investigación de operaciones o teoría de colas; para lo demás, redirige con amabilidad a lo que OptiQueue puede hacer.
- No inventes datos del caso ni resultados. Si algo no se puede calcular con las herramientas, dilo.`;

// ---------- Herramientas (se ejecutan en el navegador) ----------
const SOLVER_SCHEMA = {
  type: 'object',
  properties: {
    modelo: {
      type: 'string',
      enum: ['mm1', 'mmc', 'mm1k', 'mmck', 'mmcn', 'mg1', 'md1', 'mek1', 'mminf'],
      description: 'mm1 = M/M/1; mmc = M/M/c; mm1k = M/M/1/K; mmck = M/M/c/K (con K = c es Erlang B, sistema con pérdida); mmcn = M/M/c//N población finita; mg1 = M/G/1; md1 = M/D/1; mek1 = M/Ek/1; mminf = M/M/∞.',
    },
    titulo: { type: 'string', description: 'Nombre corto del ejercicio, p. ej. «Farmacia con 2 farmacéuticos».' },
    unidad: { type: 'string', enum: ['hora', 'minuto', 'dia', 'semana'], description: 'Unidad de tiempo de las tasas (por defecto hora). Los tiempos de resultado salen en esta unidad y en minutos.' },
    lambda: { type: 'number', description: 'Tasa de llegadas por unidad de tiempo (en población finita, por cliente). Si el enunciado da el tiempo entre llegadas, usa su inverso.' },
    mu: { type: 'number', description: 'Tasa de servicio de UN servidor por unidad de tiempo. Si el enunciado da el tiempo promedio de servicio, usa su inverso.' },
    servidores: { type: 'integer', description: 'c (modelos mmc, mmck, mmcn).' },
    capacidad: { type: 'integer', description: 'K: máximo de clientes en el sistema, incluidos los que se atienden (mm1k, mmck). Ej.: 1 en servicio + 4 sillas de espera → K = 5.' },
    poblacion: { type: 'integer', description: 'N: tamaño de la población (mmcn).' },
    sigma: { type: 'number', description: 'Desviación estándar del tiempo de servicio, en la unidad de tiempo (mg1).' },
    fases: { type: 'integer', description: 'k: fases de la distribución Erlang (mek1).' },
    costo_servidor: { type: 'number', description: 'Cs: costo por servidor por unidad de tiempo.' },
    costo_espera: { type: 'number', description: 'Cw: costo por cliente por unidad de tiempo.' },
    costo_base: { type: 'string', enum: ['Lq', 'L'], description: 'Cw se cobra por cliente en cola (Lq, costo de esperar) o en el sistema (L, p. ej. máquina parada).' },
    costo_rechazo: { type: 'number', description: 'Costo por cliente perdido (mm1k, mmck).' },
    optimizar_servidores: { type: 'boolean', description: 'true para buscar el número de servidores de menor costo (mmc, mmck, mmcn).' },
    c_min: { type: 'integer' },
    c_max: { type: 'integer' },
    espera_max: { type: 'number', description: 'Restricción: Wq máxima, en la unidad de tiempo.' },
    bloqueo_max: { type: 'number', description: 'Restricción: probabilidad de bloqueo máxima (0 a 1).' },
  },
  required: ['modelo', 'lambda', 'mu'],
  additionalProperties: false,
};
const num = (description, extra = {}) => ({ type: 'number', description, ...extra });
const SECTIONS = ['inicio', 'respuestas', 'grafico', 'escenarios', 'comparador', 'sensibilidad', 'demanda', 'gemelo', 'simulacion', 'formulacion', 'codigo'];

export const TOOLS = [
  {
    name: 'calcular_mmc',
    description:
      'Calcula las métricas M/M/c (Erlang C) para un número de ventanillas: utilización, probabilidad de esperar, Lq, L, Wq, W, costos y si cumple el límite de espera. Los parámetros omitidos toman el valor del caso.',
    input_schema: {
      type: 'object',
      properties: {
        ventanillas: { type: 'integer', minimum: 1, maximum: 80, description: 'Número de ventanillas abiertas (c).' },
        lambda: num('Llegadas por hora (λ).', { minimum: 1, maximum: 2000 }),
        mu: num('Pasajeros atendidos por hora por ventanilla (μ).', { minimum: 1, maximum: 200 }),
        costo_ventanilla: num('Cs en USD/h.', { minimum: 0, maximum: 10000 }),
        costo_espera: num('Cw en USD/h por pasajero en cola.', { minimum: 0, maximum: 10000 }),
        espera_max_min: num('Límite de espera promedio en minutos.', { minimum: 0.05, maximum: 120 }),
      },
      required: ['ventanillas'],
      additionalProperties: false,
    },
  },
  {
    name: 'optimizar',
    description:
      'Resuelve el modelo de optimización: número entero de ventanillas que minimiza el costo total cumpliendo el límite de espera, con los parámetros dados (los omitidos toman el valor del caso). Devuelve el óptimo y los escenarios vecinos.',
    input_schema: {
      type: 'object',
      properties: {
        lambda: num('Llegadas por hora (λ).', { minimum: 1, maximum: 2000 }),
        mu: num('Pasajeros atendidos por hora por ventanilla (μ).', { minimum: 1, maximum: 200 }),
        costo_ventanilla: num('Cs en USD/h.', { minimum: 0, maximum: 10000 }),
        costo_espera: num('Cw en USD/h por pasajero en cola.', { minimum: 0, maximum: 10000 }),
        espera_max_min: num('Límite de espera promedio en minutos.', { minimum: 0.05, maximum: 120 }),
      },
      additionalProperties: false,
    },
  },
  {
    name: 'rango_optimalidad',
    description:
      'Análisis de sensibilidad: intervalo de un parámetro dentro del cual la solución óptima del caso sigue siendo la misma, y qué conviene fuera de él.',
    input_schema: {
      type: 'object',
      properties: {
        parametro: { type: 'string', enum: ['mu', 'cw', 'cs', 'wq', 'lambda'], description: 'mu = velocidad de atención, cw = costo de espera, cs = costo de ventanilla, wq = espera máxima, lambda = demanda.' },
      },
      required: ['parametro'],
      additionalProperties: false,
    },
  },
  {
    name: 'simular',
    description:
      'Ejecuta la simulación de eventos discretos (varias réplicas con semilla fija) y devuelve la espera promedio con su intervalo de confianza del 95 %, la probabilidad de esperar, la fracción que supera el límite y el costo. Úsala para contrastar el modelo analítico.',
    input_schema: {
      type: 'object',
      properties: {
        ventanillas: { type: 'integer', minimum: 1, maximum: 80, description: 'Número de ventanillas.' },
        lambda: num('Llegadas por hora (λ).', { minimum: 1, maximum: 2000 }),
        mu: num('Atención por hora por ventanilla (μ).', { minimum: 1, maximum: 200 }),
        horas: num('Horas simuladas por réplica (1 a 24, por defecto 8).', { minimum: 1, maximum: 24 }),
        replicas: { type: 'integer', minimum: 2, maximum: 30, description: 'Número de réplicas (por defecto 10).' },
      },
      required: ['ventanillas'],
      additionalProperties: false,
    },
  },
  {
    name: 'ir_a_seccion',
    description: 'Desplaza la página a una sección de la aplicación para que el usuario la vea.',
    input_schema: {
      type: 'object',
      properties: { seccion: { type: 'string', enum: SECTIONS } },
      required: ['seccion'],
      additionalProperties: false,
    },
  },
  {
    name: 'configurar_gemelo',
    description:
      'Configura el gemelo digital (sala de migración animada) y lleva al usuario hasta él: número de ventanillas abiertas (12 a 20), demanda λ (120 a 240, múltiplos de 10) y si debe iniciar la simulación.',
    input_schema: {
      type: 'object',
      properties: {
        ventanillas: { type: 'integer', minimum: 12, maximum: 20 },
        lambda: { type: 'integer', minimum: 120, maximum: 240 },
        iniciar: { type: 'boolean', description: 'true para ponerla en marcha.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'estado_app',
    description: 'Devuelve el estado actual de la aplicación: si muestra el escenario base o un escenario de exploración (con sus parámetros), el óptimo vigente, las ventanillas seleccionadas y los escenarios del comparador. Úsala antes de modificar algo si no sabes en qué estado está.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'aplicar_escenario',
    description:
      'Modifica la aplicación: recalcula TODAS las secciones (indicadores, gráfico, tabla de escenarios, sensibilidad, demanda, simulación, fórmulas y gemelo) con otros datos y muestra un aviso de «modo exploración» con un botón para restaurar. El escenario base no se pierde. Los parámetros omitidos quedan como en el caso.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre corto del escenario, p. ej. «Demanda alta».' },
        lambda: num('Llegadas por hora (λ).', { minimum: 1, maximum: 2000 }),
        mu: num('Atención por hora por ventanilla (μ).', { minimum: 1, maximum: 200 }),
        costo_ventanilla: num('Cs en USD/h.', { minimum: 0, maximum: 10000 }),
        costo_espera: num('Cw en USD/h por pasajero en cola.', { minimum: 0, maximum: 10000 }),
        espera_max_min: num('Límite de espera promedio en minutos.', { minimum: 0.05, maximum: 120 }),
      },
      additionalProperties: false,
    },
  },
  {
    name: 'restaurar_enunciado',
    description: 'Vuelve a mostrar toda la aplicación con los datos del escenario base (sale del modo exploración).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'agregar_a_comparador',
    description:
      'Agrega un escenario (variante de los datos) a la tabla «Comparador de escenarios» de la app, donde se compara con el escenario base. Si se indican ventanillas, se evalúa ese número fijo; si no, se usa el óptimo. Un escenario con el mismo nombre se reemplaza. Para comparar varias alternativas, llama a esta herramienta una vez por escenario (puedes hacerlo en paralelo).',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre corto y descriptivo, p. ej. «λ = 220».' },
        lambda: num('Llegadas por hora (λ).', { minimum: 1, maximum: 2000 }),
        mu: num('Atención por hora por ventanilla (μ).', { minimum: 1, maximum: 200 }),
        costo_ventanilla: num('Cs en USD/h.', { minimum: 0, maximum: 10000 }),
        costo_espera: num('Cw en USD/h por pasajero en cola.', { minimum: 0, maximum: 10000 }),
        espera_max_min: num('Límite de espera promedio en minutos.', { minimum: 0.05, maximum: 120 }),
        ventanillas: { type: 'integer', minimum: 1, maximum: 80, description: 'Opcional: evaluar este número fijo de ventanillas en lugar del óptimo.' },
      },
      required: ['nombre'],
      additionalProperties: false,
    },
  },
  {
    name: 'quitar_del_comparador',
    description: 'Quita un escenario del comparador por su nombre; sin nombre, lo vacía.',
    input_schema: { type: 'object', properties: { nombre: { type: 'string' } }, additionalProperties: false },
  },
  {
    name: 'ajustar_sensibilidad',
    description: 'En la sección de sensibilidad de la app, selecciona un parámetro y mueve su deslizador al valor indicado para que el usuario vea cómo cambia el óptimo.',
    input_schema: {
      type: 'object',
      properties: {
        parametro: { type: 'string', enum: ['mu', 'cw', 'cs', 'wq', 'lambda'] },
        valor: { type: 'number', description: 'Valor del parámetro en su unidad (wq en minutos). Se ajusta al rango del deslizador.' },
      },
      required: ['parametro'],
      additionalProperties: false,
    },
  },
  {
    name: 'ejecutar_simulacion',
    description:
      'Ejecuta la simulación de eventos discretos en la sección Simulación de la app, a la vista del usuario, con los datos vigentes de la app (escenario base o de exploración), y devuelve los resultados frente al modelo. Duración redondeada a 1, 4, 8 o 24 h y réplicas a 5, 10 o 30.',
    input_schema: {
      type: 'object',
      properties: {
        ventanillas: { type: 'integer', minimum: 1, maximum: 80 },
        horas: num('Horas por réplica.', { minimum: 1, maximum: 24 }),
        replicas: { type: 'integer', minimum: 2, maximum: 30 },
        semilla: { type: 'integer', minimum: 1 },
      },
      required: ['ventanillas'],
      additionalProperties: false,
    },
  },
  {
    name: 'resolver_cola',
    description: 'Resuelve cualquier ejercicio de teoría de colas con el resolvedor general de la app (mismos cálculos que su página «Resolvedor de colas») y devuelve todas las medidas de desempeño, Pn, costos y, si se pide, el número de servidores de menor costo. No cambia lo que ve el usuario.',
    input_schema: SOLVER_SCHEMA,
  },
  {
    name: 'mostrar_en_resolvedor',
    description: 'Carga un ejercicio en la página «Resolvedor de colas» para que el usuario vea el desarrollo paso a paso con fórmulas, la distribución Pn, los costos y la tabla de servidores. Si el usuario está en la página principal, el resolvedor se abre automáticamente al terminar tu respuesta (la conversación continúa allí). Devuelve los mismos resultados que resolver_cola.',
    input_schema: SOLVER_SCHEMA,
  },
].map((t) => ({ ...t, eager_input_streaming: true }));

// ---------- Validación de la conversación que envía el navegador ----------
function sanitize(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) throw new BadInput('Conversación inválida o demasiado larga.');
  if (messages[0].role !== 'user') throw new BadInput('La conversación debe empezar con el usuario.');
  return messages.map((m) => {
    if (m.role === 'user') {
      if (typeof m.content === 'string') {
        if (!m.content.trim() || m.content.length > MAX_USER_CHARS) throw new BadInput(`Cada mensaje admite hasta ${MAX_USER_CHARS} caracteres.`);
        return { role: 'user', content: m.content };
      }
      if (Array.isArray(m.content) && m.content.every((b) => b?.type === 'tool_result' && typeof b.tool_use_id === 'string')) {
        return {
          role: 'user',
          content: m.content.map((b) => ({ type: 'tool_result', tool_use_id: b.tool_use_id, content: String(b.content ?? '').slice(0, 20000), ...(b.is_error ? { is_error: true } : {}) })),
        };
      }
      throw new BadInput('Mensaje de usuario inválido.');
    }
    if (m.role === 'assistant' && Array.isArray(m.content)) {
      // Tras un cambio de modelo a mitad de respuesta (bloque `fallback`), se omiten los
      // bloques internos previos al último cambio; el resto se devuelve sin tocar.
      const lastFallback = m.content.map((b) => b?.type).lastIndexOf('fallback');
      const internal = new Set(['thinking', 'redacted_thinking', 'tool_use', 'server_tool_use']);
      const content = lastFallback < 0 ? m.content : m.content.filter((b, i) => i >= lastFallback || !internal.has(b?.type));
      return { role: 'assistant', content };
    }
    throw new BadInput('Rol de mensaje inválido.');
  });
}

class BadInput extends Error {}

// ---------- Límite de uso por IP ----------
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < RATE.windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > RATE.max;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY_BYTES) throw new BadInput('Solicitud demasiado grande.');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};


/**
 * Interruptor del administrador: ASISTENTE_IA=off apaga el asistente sin tocar el código.
 * Se lee en cada solicitud, así que basta con cambiar la variable (en Vercel, y volver a desplegar).
 */
const assistantEnabled = () => !/^(off|false|0|no|desactivado|apagado)$/i.test(String(process.env.ASISTENTE_IA ?? 'on').trim());
const hasCredentials = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

/** Manejador HTTP (firma Node: req, res). GET informa si está disponible; POST responde NDJSON. */
export async function handleAssistant(req, res) {
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return json(res, 200, { habilitado: assistantEnabled() && hasCredentials() });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido.' });
  if (!assistantEnabled()) return json(res, 403, { error: 'El asistente está desactivado por el administrador.' });
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? '').split(',')[0].trim();
  if (rateLimited(ip)) return json(res, 429, { error: 'Demasiadas preguntas seguidas. Espera unos minutos e inténtalo de nuevo.' });

  let messages;
  try {
    messages = sanitize((await readBody(req)).messages);
  } catch (err) {
    return json(res, 400, { error: err instanceof BadInput ? err.message : 'Solicitud inválida.' });
  }

  // Cliente nuevo por solicitud: es liviano y así toma la clave vigente (p. ej. tras editar .env.local)
  let client;
  try {
    client = new Anthropic();
  } catch {
    return json(res, 503, { error: 'El asistente no está configurado en este servidor (falta ANTHROPIC_API_KEY).' });
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');
  const send = (obj) => res.write(`${JSON.stringify(obj)}\n`);

  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      // Si el modelo declina por sus filtros de seguridad, la API reintenta sola con un modelo de respaldo
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // Chat: respuestas rápidas; las cifras exactas las dan las herramientas
      output_config: { effort: 'low' },
      // Caché en dos niveles: instrucciones + herramientas (fijo) y el historial de la
      // conversación (la marca automática avanza con cada mensaje). Lo ya leído cuesta 1/20.
      cache_control: { type: 'ephemeral' },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      messages,
    });
    req.on?.('close', () => {
      if (!res.writableEnded) stream.abort();
    });
    stream.on('text', (d) => send({ t: 'text', d }));
    const final = await stream.finalMessage();
    send({ t: 'done', content: final.content, stop_reason: final.stop_reason });
  } catch (err) {
    let message = 'El asistente no pudo responder. Inténtalo de nuevo.';
    if (err instanceof Anthropic.AuthenticationError) message = 'La clave de la API no es válida o falta en el servidor.';
    else if (err instanceof Anthropic.RateLimitError) message = 'El servicio está saturado en este momento. Inténtalo en un minuto.';
    else if (err instanceof Anthropic.BadRequestError) message = 'La conversación no es válida; empieza una nueva.';
    else if (err instanceof Anthropic.APIError) message = `Error del servicio (${err.status ?? 'sin código'}). Inténtalo de nuevo.`;
    else if (err instanceof Anthropic.AnthropicError) message = 'El asistente no está configurado en este servidor: falta la clave ANTHROPIC_API_KEY.';
    console.error('[asistente]', err);
    send({ t: 'error', message });
  } finally {
    res.end();
  }
}
