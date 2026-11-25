"""
Núcleo numérico: resolución de sistemas no cuadrados por mínimos cuadrados.

Un sistema A x = b con A de tamaño m x n (m != n) en general no tiene una
solución exacta única:

* m > n (sobredeterminado): más ecuaciones que incógnitas. Casi nunca existe
  x que cumpla todas a la vez; se busca x̂ que minimice ||A x - b||₂.
  Si A tiene rango completo por columnas, x̂ es la solución única de las
  ecuaciones normales  AᵀA x̂ = Aᵀb.

* m < n (subdeterminado): menos ecuaciones que incógnitas. Hay infinitas
  soluciones; se elige la de norma mínima. Si A tiene rango completo por
  filas,  x = Aᵀ (AAᵀ)⁻¹ b.

* Rango deficiente (columnas o filas dependientes): ninguna de las dos
  fórmulas aplica porque AᵀA y AAᵀ son singulares. Se usa la pseudoinversa
  de Moore-Penrose calculada con la SVD: x = A⁺ b, que es la solución de
  mínimos cuadrados de norma mínima.

Las ecuaciones normales se resuelven con eliminación de Gauss con pivoteo
parcial y se registra cada paso para mostrarlo en el frontend. NumPy se usa
para la factorización QR, la SVD y para verificar el resultado.
"""

from __future__ import annotations

import math

import numpy as np

MAX_FILAS = 50
MAX_COLUMNAS = 10
MAX_PUNTOS = 500
TOL_CERO = 1e-12


class ErrorEntrada(ValueError):
    """Datos de entrada inválidos; la vista lo convierte en un HTTP 400."""


# ---------------------------------------------------------------------------
# Validación
# ---------------------------------------------------------------------------

def _numero(valor, donde):
    if isinstance(valor, bool):
        raise ErrorEntrada(f"{donde}: se esperaba un número, no un booleano.")
    try:
        x = float(valor)
    except (TypeError, ValueError):
        raise ErrorEntrada(f"{donde}: «{valor}» no es un número.") from None
    if not math.isfinite(x):
        raise ErrorEntrada(f"{donde}: el valor debe ser finito.")
    return x


def validar_sistema(A, b):
    if not isinstance(A, list) or not A:
        raise ErrorEntrada("La matriz A debe ser una lista de filas no vacía.")
    if not all(isinstance(f, list) for f in A):
        raise ErrorEntrada("Cada fila de A debe ser una lista.")
    n = len(A[0])
    if n == 0:
        raise ErrorEntrada("La matriz A no puede tener filas vacías.")
    if any(len(f) != n for f in A):
        raise ErrorEntrada("Todas las filas de A deben tener el mismo número de columnas.")
    m = len(A)
    if m > MAX_FILAS or n > MAX_COLUMNAS:
        raise ErrorEntrada(f"Tamaño máximo admitido: {MAX_FILAS} x {MAX_COLUMNAS}.")
    if not isinstance(b, list) or len(b) != m:
        raise ErrorEntrada(f"El vector b debe tener {m} componentes (una por ecuación).")

    A_ = np.array([[_numero(v, f"A[{i + 1},{j + 1}]") for j, v in enumerate(fila)]
                   for i, fila in enumerate(A)], dtype=float)
    b_ = np.array([_numero(v, f"b[{i + 1}]") for i, v in enumerate(b)], dtype=float)
    return A_, b_


# ---------------------------------------------------------------------------
# Eliminación de Gauss con pivoteo parcial (registrando pasos)
# ---------------------------------------------------------------------------

def gauss_con_pasos(M, v):
    """Resuelve M y = v (M cuadrada) y devuelve (y, pasos)."""
    k = len(v)
    Ab = np.hstack([M.astype(float), v.reshape(-1, 1).astype(float)])
    pasos = [{"tipo": "inicio", "descripcion": "Matriz aumentada inicial", "matriz": Ab.tolist()}]

    escala = max(1.0, float(np.max(np.abs(M))))
    for col in range(k):
        fila_pivote = col + int(np.argmax(np.abs(Ab[col:, col])))
        if abs(Ab[fila_pivote, col]) < TOL_CERO * escala:
            raise np.linalg.LinAlgError("La matriz del sistema normal es singular.")
        if fila_pivote != col:
            Ab[[col, fila_pivote]] = Ab[[fila_pivote, col]]
            pasos.append({
                "tipo": "pivoteo",
                "descripcion": f"Intercambio F{col + 1} ↔ F{fila_pivote + 1} (pivote de mayor valor absoluto)",
                "matriz": Ab.tolist(),
            })
        operaciones = []
        for fila in range(col + 1, k):
            factor = Ab[fila, col] / Ab[col, col]
            if factor != 0.0:
                Ab[fila] = Ab[fila] - factor * Ab[col]
                Ab[fila, col] = 0.0
                operaciones.append({"fila": fila + 1, "pivote": col + 1, "factor": float(factor)})
        if operaciones:
            pasos.append({
                "tipo": "eliminacion",
                "descripcion": f"Eliminación debajo del pivote de la columna {col + 1}",
                "operaciones": operaciones,
                "matriz": Ab.tolist(),
            })

    y = np.zeros(k)
    sustitucion = []
    for i in range(k - 1, -1, -1):
        suma = float(Ab[i, i + 1:k] @ y[i + 1:k])
        y[i] = (Ab[i, k] - suma) / Ab[i, i]
        sustitucion.append({"variable": i + 1, "valor": float(y[i]),
                            "numerador": float(Ab[i, k] - suma), "pivote": float(Ab[i, i])})
    pasos.append({"tipo": "sustitucion", "descripcion": "Sustitución regresiva",
                  "valores": sustitucion, "matriz": Ab.tolist()})
    return y, pasos


# ---------------------------------------------------------------------------
# Resolución del sistema
# ---------------------------------------------------------------------------

def _clasificar(m, n, rango, rango_aumentado):
    if m > n:
        forma = "sobredeterminado"
    elif m < n:
        forma = "subdeterminado"
    else:
        forma = "cuadrado"
    consistente = rango == rango_aumentado
    if consistente and rango == n:
        soluciones = "única"
    elif consistente:
        soluciones = "infinitas"
    else:
        soluciones = "ninguna exacta"
    return forma, consistente, soluciones


def _cond(M):
    c = float(np.linalg.cond(M))
    return c if math.isfinite(c) else None


def resolver_sistema(A, b):
    """Resuelve A x = b (no necesariamente cuadrado) por mínimos cuadrados."""
    A, b = validar_sistema(A, b)
    m, n = A.shape

    U, s, Vt = np.linalg.svd(A)
    tol = max(m, n) * np.finfo(float).eps * (s[0] if s.size else 0.0)
    rango = int(np.sum(s > tol))
    rango_aumentado = int(np.linalg.matrix_rank(np.hstack([A, b.reshape(-1, 1)]), tol=None))
    forma, consistente, soluciones = _clasificar(m, n, rango, rango_aumentado)

    resultado = {
        "m": m,
        "n": n,
        "rango": rango,
        "rango_aumentado": rango_aumentado,
        "forma": forma,
        "consistente": consistente,
        "soluciones": soluciones,
        "valores_singulares": s.tolist(),
        "condicion_A": float(s[0] / s[rango - 1]) if rango else None,
    }

    if rango == 0:
        x = np.zeros(n)
        resultado.update(metodo="nulo", formula=r"A = 0 \Rightarrow \hat{x} = 0", pasos=[])
    elif rango == n == m:
        # Sistema cuadrado no singular: no hace falta mínimos cuadrados.
        x, pasos = gauss_con_pasos(A, b)
        resultado.update(metodo="gauss_directo", formula=r"A\,x = b", pasos=pasos)
    elif rango == n:
        # Rango completo por columnas: ecuaciones normales AᵀA x = Aᵀb.
        AtA = A.T @ A
        Atb = A.T @ b
        x, pasos = gauss_con_pasos(AtA, Atb)
        Q, R = np.linalg.qr(A)
        x_qr = np.linalg.solve(R, Q.T @ b)
        resultado.update(
            metodo="ecuaciones_normales",
            formula=r"A^{T}A\,\hat{x} = A^{T}b",
            AtA=AtA.tolist(),
            Atb=Atb.tolist(),
            condicion_AtA=_cond(AtA),
            pasos=pasos,
            x_qr=x_qr.tolist(),
            diferencia_qr=float(np.linalg.norm(x - x_qr, np.inf)),
        )
    elif rango == m:
        # Rango completo por filas (m < n): solución de norma mínima.
        AAt = A @ A.T
        y, pasos = gauss_con_pasos(AAt, b)
        x = A.T @ y
        resultado.update(
            metodo="norma_minima",
            formula=r"(AA^{T})\,y = b,\quad x = A^{T}y",
            AAt=AAt.tolist(),
            y=y.tolist(),
            condicion_AAt=_cond(AAt),
            pasos=pasos,
        )
    else:
        # Rango deficiente: pseudoinversa por SVD.
        s_inv = np.array([1.0 / v if v > tol else 0.0 for v in s])
        S_pinv = np.zeros((n, m))
        S_pinv[: s.size, : s.size] = np.diag(s_inv)
        A_pinv = Vt.T @ S_pinv @ U.T
        x = A_pinv @ b
        resultado.update(
            metodo="pseudoinversa",
            formula=r"\hat{x} = A^{+}b = V\,\Sigma^{+}\,U^{T}b",
            pseudoinversa=A_pinv.tolist(),
            tolerancia_rango=float(tol),
            pasos=[],
        )

    Ax = A @ x
    r = b - Ax
    nucleo = Vt[rango:].T  # columnas: base ortonormal del núcleo de A
    x_numpy = np.linalg.lstsq(A, b, rcond=None)[0]

    resultado.update(
        x=x.tolist(),
        Ax=Ax.tolist(),
        residuo=r.tolist(),
        norma_residuo=float(np.linalg.norm(r)),
        suma_cuadrados=float(r @ r),
        norma_x=float(np.linalg.norm(x)),
        ortogonalidad=(A.T @ r).tolist(),  # ≈ 0: r es ortogonal a las columnas de A
        base_nucleo=nucleo.T.tolist() if nucleo.size else [],
        verificacion_numpy=x_numpy.tolist(),
        diferencia_numpy=float(np.linalg.norm(x - x_numpy, np.inf)),
    )
    return resultado


# ---------------------------------------------------------------------------
# Ajuste de curvas (la aplicación clásica de los sistemas sobredeterminados)
# ---------------------------------------------------------------------------

MODELOS = {
    "polinomial": "Polinomio de grado k",
    "exponencial": "y = a·e^(b·x)",
    "potencia": "y = a·x^b",
    "logaritmico": "y = a + b·ln(x)",
}


def _fmt(c):
    return f"{c:.6g}"


def _ecuacion_polinomio(coef):
    terminos = []
    for k, c in enumerate(coef):
        if k == 0:
            base = _fmt(c)
        elif k == 1:
            base = f"{_fmt(abs(c))}x"
        else:
            base = f"{_fmt(abs(c))}x^{{{k}}}"
        if k == 0:
            terminos.append(base)
        else:
            terminos.append(("- " if c < 0 else "+ ") + base)
    return "y = " + " ".join(terminos)


def ajustar_curva(xs, ys, modelo="polinomial", grado=1):
    if modelo not in MODELOS:
        raise ErrorEntrada(f"Modelo desconocido. Opciones: {', '.join(MODELOS)}.")
    if not isinstance(xs, list) or not isinstance(ys, list) or len(xs) != len(ys):
        raise ErrorEntrada("x e y deben ser listas del mismo tamaño.")
    if len(xs) > MAX_PUNTOS:
        raise ErrorEntrada(f"Máximo {MAX_PUNTOS} puntos.")
    x = np.array([_numero(v, f"x[{i + 1}]") for i, v in enumerate(xs)])
    y = np.array([_numero(v, f"y[{i + 1}]") for i, v in enumerate(ys)])

    if modelo == "polinomial":
        try:
            grado = int(grado)
        except (TypeError, ValueError):
            raise ErrorEntrada("El grado debe ser un entero.") from None
        if not 0 <= grado <= MAX_COLUMNAS - 1:
            raise ErrorEntrada(f"El grado debe estar entre 0 y {MAX_COLUMNAS - 1}.")
        p = grado + 1
    else:
        p = 2
    if len(x) < p:
        raise ErrorEntrada(
            f"Se necesitan al menos {p} puntos para estimar {p} parámetros "
            f"(con {len(x)} puntos el sistema sería subdeterminado)."
        )

    # Linealización: el modelo se escribe como A c = b con A conocida.
    if modelo == "polinomial":
        A = np.vander(x, p, increasing=True)
        b = y
        transformacion = None
    elif modelo == "exponencial":
        if np.any(y <= 0):
            raise ErrorEntrada("El modelo exponencial requiere y > 0 (se aplica ln y).")
        A = np.column_stack([np.ones_like(x), x])
        b = np.log(y)
        transformacion = r"\ln y = \ln a + b\,x"
    elif modelo == "potencia":
        if np.any(x <= 0) or np.any(y <= 0):
            raise ErrorEntrada("El modelo de potencia requiere x > 0 e y > 0 (se aplica ln).")
        A = np.column_stack([np.ones_like(x), np.log(x)])
        b = np.log(y)
        transformacion = r"\ln y = \ln a + b\,\ln x"
    else:  # logaritmico
        if np.any(x <= 0):
            raise ErrorEntrada("El modelo logarítmico requiere x > 0.")
        A = np.column_stack([np.ones_like(x), np.log(x)])
        b = y
        transformacion = None

    sistema = resolver_sistema(A.tolist(), b.tolist())
    c = np.array(sistema["x"])

    if modelo == "polinomial":
        coeficientes = {f"c{k}": float(v) for k, v in enumerate(c)}
        evaluar = lambda t: np.polyval(c[::-1], t)  # noqa: E731
        ecuacion = _ecuacion_polinomio(c)
    elif modelo == "exponencial":
        a, bb = math.exp(c[0]), c[1]
        coeficientes = {"a": a, "b": float(bb)}
        evaluar = lambda t: a * np.exp(bb * t)  # noqa: E731
        ecuacion = f"y = {_fmt(a)}\\,e^{{{_fmt(bb)}x}}"
    elif modelo == "potencia":
        a, bb = math.exp(c[0]), c[1]
        coeficientes = {"a": a, "b": float(bb)}
        evaluar = lambda t: a * np.power(t, bb)  # noqa: E731
        ecuacion = f"y = {_fmt(a)}\\,x^{{{_fmt(bb)}}}"
    else:
        a, bb = c
        coeficientes = {"a": float(a), "b": float(bb)}
        evaluar = lambda t: a + bb * np.log(t)  # noqa: E731
        signo = "-" if bb < 0 else "+"
        ecuacion = f"y = {_fmt(a)} {signo} {_fmt(abs(bb))}\\ln x"

    y_ajustado = evaluar(x)
    residuos = y - y_ajustado
    sse = float(residuos @ residuos)
    sst = float(((y - y.mean()) ** 2).sum())
    r2 = 1.0 - sse / sst if sst > 0 else (1.0 if sse < TOL_CERO else 0.0)

    lo, hi = float(x.min()), float(x.max())
    margen = 0.05 * (hi - lo) if hi > lo else 1.0
    lo_curva = lo - margen
    if modelo != "polinomial" and lo_curva <= 0 and modelo in ("potencia", "logaritmico"):
        lo_curva = lo * 0.95
    t = np.linspace(lo_curva, hi + margen, 200)

    return {
        "modelo": modelo,
        "descripcion_modelo": MODELOS[modelo],
        "parametros": p,
        "puntos": len(x),
        "transformacion": transformacion,
        "matriz_diseno": A.tolist(),
        "vector_b": b.tolist(),
        "coeficientes": coeficientes,
        "ecuacion": ecuacion,
        "y_ajustado": y_ajustado.tolist(),
        "residuos": residuos.tolist(),
        "sse": sse,
        "ecm": sse / len(x),
        "r2": float(r2),
        "curva": {"x": t.tolist(), "y": evaluar(t).tolist()},
        "sistema": sistema,
    }
