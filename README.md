# OptiQueue: colas M/M/c en migración aeroportuaria

Dashboard del Ejercicio 4 (teoría de colas + simulación + programación entera), migrado a Vite.

## Uso

```bash
npm install
npm run dev       # servidor de desarrollo (http://localhost:5173)
npm run build     # build de producción en dist/
npm run preview   # sirve dist/
npm test          # pruebas del modelo (Vitest)
```

## Estructura

```
index.html               Estructura de la página y diálogos
src/config.js            Parámetros del enunciado (única fuente de verdad)
src/lib/queue.js         Modelo M/M/c (Erlang C), optimización y ahorro
src/lib/simulation.js    Simulación de eventos discretos con semilla y réplicas
src/lib/format.js        Formato numérico es-ES
src/sections/*.js        Secciones de la interfaz (fórmulas con KaTeX, código con highlight.js)
python/                  Código Python ejecutable (modelo, simulación, gráfico) y sus salidas reales
tests/model.test.js      Verificación de los valores del modelo
legacy/                  HTML original, conservado como referencia
```

Para cambiar el escenario (λ, μ, costos, SLA) basta con editar `src/config.js`:
KPIs, tabla, gráfico, textos y simulación se recalculan solos.

## Código Python

```bash
cd python
pip install -r requirements.txt
python modelo.py        # tabla de escenarios y óptimo con PuLP
python simulacion.py    # validación con SimPy
python grafico.py       # genera grafico_analitico.png
```

La página muestra estos mismos archivos (se importan con `?raw`). Si se modifican, conviene volver a
ejecutarlos y guardar su salida en `python/salidas/` para que la página muestre resultados actualizados.
