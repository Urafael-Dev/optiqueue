// Enciende o apaga el asistente con IA en local: npm run ia:on / npm run ia:off
// (en Vercel: Settings → Environment Variables → ASISTENTE_IA = on | off, y volver a desplegar)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const mode = process.argv[2];
if (!['on', 'off'].includes(mode)) {
  console.error('Uso: npm run ia:on | npm run ia:off');
  process.exit(1);
}
const file = new URL('../.env.local', import.meta.url);
const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
const line = `ASISTENTE_IA=${mode}`;
const next = /^ASISTENTE_IA=.*$/m.test(text) ? text.replace(/^ASISTENTE_IA=.*$/m, line) : `${text.replace(/\n?$/, '\n')}${line}\n`;
writeFileSync(file, next);
console.log(`Asistente con IA ${mode === 'on' ? 'ENCENDIDO' : 'APAGADO'} (.env.local → ${line}).`);
console.log('Si el servidor de desarrollo está corriendo, Vite lo recarga solo; si no, inícialo con npm run dev.');
