"""Ejemplos precargados y banco de preguntas del cuestionario.

Las respuestas correctas nunca salen al frontend: se califican en el servidor.
"""

EJEMPLOS = [
    {
        "id": "recta",
        "titulo": "Calibración de un sensor (4 × 2)",
        "descripcion": "Ajustar y = c₀ + c₁x a 4 lecturas: más ecuaciones que incógnitas.",
        "A": [[1, 1], [1, 2], [1, 3], [1, 4]],
        "b": [2, 3, 5, 6],
    },
    {
        "id": "inconsistente3x2",
        "titulo": "Sistema inconsistente 3 × 2",
        "descripcion": "Tres rectas que no se cortan en un mismo punto; se visualiza en 3D.",
        "A": [[1, 0], [0, 1], [1, 1]],
        "b": [1, 1, 0],
    },
    {
        "id": "subdeterminado",
        "titulo": "Subdeterminado 2 × 3",
        "descripcion": "Dos ecuaciones, tres incógnitas: infinitas soluciones, se elige la de norma mínima.",
        "A": [[1, 1, 1], [1, 2, 3]],
        "b": [6, 14],
    },
    {
        "id": "rango_deficiente",
        "titulo": "Rango deficiente 4 × 3",
        "descripcion": "La tercera columna es suma de las otras dos: AᵀA es singular y se usa la SVD.",
        "A": [[1, 2, 3], [2, 1, 3], [1, 1, 2], [3, 0, 3]],
        "b": [6, 5, 4, 4],
    },
    {
        "id": "parabola",
        "titulo": "Trayectoria parabólica (6 × 3)",
        "descripcion": "Ajuste de y = c₀ + c₁t + c₂t² a mediciones con ruido.",
        "A": [[1, 0, 0], [1, 1, 1], [1, 2, 4], [1, 3, 9], [1, 4, 16], [1, 5, 25]],
        "b": [1.1, 5.9, 9.2, 10.1, 9.0, 5.8],
    },
]

PREGUNTAS = [
    {
        "id": "p1",
        "tipo": "opcion",
        "enunciado": r"Un sistema \(A\mathbf{x}=\mathbf{b}\) con \(A\) de tamaño \(5\times 3\) y rango 3 es:",
        "opciones": [
            "Cuadrado",
            "Sobredeterminado",
            "Subdeterminado",
            "Siempre consistente",
        ],
        "correcta": 1,
        "explicacion": "Tiene más ecuaciones (5) que incógnitas (3).",
    },
    {
        "id": "p2",
        "tipo": "opcion",
        "enunciado": r"Si \(A\) es \(6\times 2\), ¿qué tamaño tiene la matriz de las ecuaciones normales \(A^TA\)?",
        "opciones": [r"\(6\times 6\)", r"\(2\times 6\)", r"\(2\times 2\)", r"\(6\times 2\)"],
        "correcta": 2,
        "explicacion": r"\((2\times 6)(6\times 2) = 2\times 2\): una ecuación por incógnita.",
    },
    {
        "id": "p3",
        "tipo": "numero",
        "enunciado": (
            r"Para \(A=\begin{bmatrix}1&0\\0&1\\1&1\end{bmatrix}\), "
            r"\(\mathbf{b}=\begin{bmatrix}1\\1\\0\end{bmatrix}\), calcula \(\hat{x}_1\) "
            r"(4 decimales)."
        ),
        "correcta": 1 / 3,
        "tolerancia": 5e-3,
        "explicacion": r"\(A^TA=\begin{bmatrix}2&1\\1&2\end{bmatrix}\), \(A^Tb=(1,1)^T\Rightarrow \hat{x}=(1/3,\,1/3)\).",
    },
    {
        "id": "p4",
        "tipo": "opcion",
        "enunciado": r"En la solución de mínimos cuadrados, el residuo \(\mathbf{r}=\mathbf{b}-A\hat{\mathbf{x}}\) es ortogonal a:",
        "opciones": [
            r"Las filas de \(A\)",
            r"El vector \(\hat{\mathbf{x}}\)",
            r"Las columnas de \(A\)",
            r"El vector \(\mathbf{b}\)",
        ],
        "correcta": 2,
        "explicacion": r"\(A^T\mathbf{r}=0\): \(A\hat{x}\) es la proyección de \(b\) sobre el espacio columna.",
    },
    {
        "id": "p5",
        "tipo": "opcion",
        "enunciado": r"Para un sistema subdeterminado con \(A\) de rango completo por filas, la solución de norma mínima es:",
        "opciones": [
            r"\(\mathbf{x}=(A^TA)^{-1}A^T\mathbf{b}\)",
            r"\(\mathbf{x}=A^T(AA^T)^{-1}\mathbf{b}\)",
            r"\(\mathbf{x}=A^{-1}\mathbf{b}\)",
            r"No existe solución",
        ],
        "correcta": 1,
        "explicacion": r"\(A^TA\) es singular cuando \(m<n\); se usa \(AA^T\), que es \(m\times m\) e invertible.",
    },
    {
        "id": "p6",
        "tipo": "numero",
        "enunciado": r"Ajusta una recta \(y=c_0+c_1x\) a los puntos \((0,1),(1,3),(2,4)\). ¿Cuánto vale la pendiente \(c_1\)?",
        "correcta": 1.5,
        "tolerancia": 5e-3,
        "explicacion": r"\(A^TA=\begin{bmatrix}3&3\\3&5\end{bmatrix}\), \(A^Tb=(8,11)^T\Rightarrow c_1=1.5\), \(c_0=7/6\).",
    },
    {
        "id": "p7",
        "tipo": "opcion",
        "enunciado": r"¿Por qué se prefiere QR a las ecuaciones normales en problemas mal condicionados?",
        "opciones": [
            "Porque QR da otra solución distinta",
            r"Porque \(\kappa(A^TA)=\kappa(A)^2\) y se pierde precisión",
            "Porque QR solo sirve para matrices cuadradas",
            r"Porque \(A^TA\) nunca es simétrica",
        ],
        "correcta": 1,
        "explicacion": r"Formar \(A^TA\) eleva al cuadrado el número de condición.",
    },
]


def preguntas_publicas():
    campos = ("id", "tipo", "enunciado", "opciones")
    return [{k: p[k] for k in campos if k in p} for p in PREGUNTAS]


def calificar(respuestas):
    detalle = []
    aciertos = 0
    for p in PREGUNTAS:
        dada = respuestas.get(p["id"])
        correcta = False
        if dada is not None and dada != "":
            try:
                if p["tipo"] == "opcion":
                    correcta = int(dada) == p["correcta"]
                else:
                    correcta = abs(float(str(dada).replace(",", ".")) - p["correcta"]) <= p["tolerancia"]
            except (TypeError, ValueError):
                correcta = False
        aciertos += correcta
        detalle.append({"id": p["id"], "correcta": correcta, "explicacion": p["explicacion"]})
    total = len(PREGUNTAS)
    return {"aciertos": aciertos, "total": total,
            "puntaje": round(100 * aciertos / total), "detalle": detalle}
