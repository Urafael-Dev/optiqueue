# Resolución de sistemas no cuadrados · Método de mínimos cuadrados

Aplicación didáctica con **backend en Django** y **frontend en Vite** (JavaScript, KaTeX, Chart.js y three.js).
Sigue la estructura del repositorio de referencia `gabrielkc18/numerical_methods` (teoría → ejercicio resuelto →
simulador → evaluación con ranking), adaptada al tema de sistemas \(A\mathbf{x}=\mathbf{b}\) con \(A\) de \(m\times n\), \(m\neq n\).

## Qué incluye

| Sección | Contenido |
|---|---|
| Teoría | Sistemas sobredeterminados, subdeterminados y de rango deficiente; deducción de las ecuaciones normales; interpretación geométrica; ecuaciones normales frente a QR (κ(AᵀA) = κ(A)²). |
| Ejemplo resuelto | Calibración de un sensor: 4 lecturas, recta \(y = 0.5 + 1.4x\), paso a paso. |
| Calculadora m × n | El backend clasifica el sistema (rango de A y de [A\|b]), elige el método y devuelve cada paso de Gauss con pivoteo parcial, el residuo, \(A^T r ≈ 0\), números de condición y la verificación con QR y `numpy.linalg.lstsq`. |
| Ajuste de curvas | Polinomial de grado k, exponencial, potencia y logarítmico (linealizados), con gráfica, residuos, R² y el sistema sobredeterminado que se resuelve. |
| Geometría 3D | Sistema 3 × 2 editable: plano del espacio columna, \(\mathbf{b}\), su proyección \(A\hat{x}\) y el residuo perpendicular. |
| Evaluación | 7 preguntas calificadas en el servidor (las respuestas no se envían al navegador), guardadas en SQLite, con ranking. |

### Métodos según el caso

| Caso | Condición | Método |
|---|---|---|
| Cuadrado no singular | rango = m = n | Gauss directo |
| Sobredeterminado | rango = n < m | Ecuaciones normales \(A^TA\hat x = A^Tb\) + Gauss |
| Subdeterminado | rango = m < n | Norma mínima \(x = A^T(AA^T)^{-1}b\) |
| Rango deficiente | rango < mín(m, n) | Pseudoinversa por SVD, \(x = A^+b\) |

## Estructura

```
minimos-cuadrados/
├── backend/               Django
│   ├── config/            settings, urls
│   └── sistemas/
│       ├── solver.py      núcleo numérico (NumPy)
│       ├── contenido.py   ejemplos y banco de preguntas
│       ├── views.py       API JSON
│       ├── models.py      Evaluacion, Resolucion (historial)
│       └── tests.py       19 pruebas
└── frontend/              Vite
    ├── index.html
    └── src/               main, api, calculadora, ajuste, geometria3d, quiz, style.css
```

## Cómo ejecutarlo

Backend (puerto 8000):

```bash
cd minimos-cuadrados/backend
python -m venv .venv && source .venv/bin/activate   # en Windows: .venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser    # opcional, para ver evaluaciones en /admin
python manage.py runserver
```

Frontend (puerto 5173, en otra terminal):

```bash
cd minimos-cuadrados/frontend
npm install
npm run dev
```

Abre http://localhost:5173. Vite redirige `/api` a Django, así que no hace falta configurar CORS en desarrollo.

Pruebas del backend: `python manage.py test`.

## API

| Método | Ruta | Cuerpo / respuesta |
|---|---|---|
| GET | `/api/` | Estado y lista de rutas |
| GET | `/api/ejemplos/` | Sistemas de ejemplo |
| POST | `/api/sistemas/resolver/` | `{"A": [[1,1],[1,2],[1,3]], "b": [1,2,2]}` → clasificación, método, pasos, x̂, residuo… |
| POST | `/api/ajuste/` | `{"x": [...], "y": [...], "modelo": "polinomial", "grado": 2}` → coeficientes, R², curva |
| GET | `/api/historial/` | Últimas 15 resoluciones |
| GET | `/api/quiz/preguntas/` | Preguntas sin respuestas |
| POST | `/api/quiz/enviar/` | `{"nombre", "correo", "respuestas": {"p1": 1, ...}}` → puntaje |
| GET | `/api/quiz/ranking/` | Top 10 |

Los errores de entrada devuelven HTTP 400 con `{"error": "mensaje legible"}`.

## Producción

Variables del backend: `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=0`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`
(URL del frontend). Para el frontend: `VITE_API_URL=https://tu-backend` antes de `npm run build`.

## Diferencias con el repositorio de referencia

- FastAPI → Django (con modelos, migraciones, admin y pruebas).
- HTML/JS sin empaquetar → Vite con módulos ES y dependencias por npm.
- El inicio de sesión con Google del repositorio de referencia estaba atado a un Client ID y un dominio institucional
  ajenos; aquí el cuestionario pide nombre y correo. Si lo necesitas, se puede añadir OAuth después.
- El ranking se guarda en SQLite en lugar de una lista en memoria que se pierde al reiniciar.
