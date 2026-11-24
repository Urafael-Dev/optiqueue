/**
 * Registro mínimo para que el asistente pueda accionar partes de la página
 * (por ejemplo, el gemelo digital) sin acoplarse a su implementación.
 */
const registry = new Map();
export const provide = (name, api) => registry.set(name, api);
export const use = (name) => registry.get(name);
