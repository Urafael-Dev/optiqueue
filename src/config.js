/**
 * Parámetros del caso de demostración: control migratorio de un aeropuerto.
 * Todo lo que muestra la página se calcula a partir de este objeto,
 * así las cifras de KPIs, tabla, gráfico y textos nunca se contradicen.
 */
export const PARAMS = Object.freeze({
  lambda: 180, // llegadas, pasajeros/h
  mu: 15, // servicio por ventanilla, pasajeros/h
  cs: 50, // costo por ventanilla abierta, USD/h
  cw: 40, // costo de espera, USD/h por pasajero en cola
  wqMaxH: 0.1, // SLA: Wq <= 0,1 h (6 min)
  baseWindows: 16, // escenario actual: 16 ventanillas fijas
  reportedBaseCost: 1120, // costo reportado del escenario actual, USD/h
  peakHoursPerDay: 16, // supuesto para anualizar el ahorro
  daysPerYear: 365,
  xMin: 12, // rango mostrado en tabla y gemelo digital
  xMax: 20,
});
