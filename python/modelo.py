"""Modelo M/M/c del control migratorio y optimización con PuLP.

Variables de decisión (las únicas del modelo):
    x  número entero de ventanillas abiertas
    y  costo total resultante, en USD/h
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import pulp

# Parámetros del enunciado
LAMBDA = 180.0  # tasa de llegadas (pasajeros/h)
MU = 15.0  # tasa de servicio por ventanilla (pasajeros/h)
CS = 50.0  # costo por ventanilla abierta (USD/h)
CW = 40.0  # costo por pasajero en cola (USD/h)
WQ_MAX = 0.1  # espera máxima promedio en cola (h) = 6 min
X_MAX = 20  # cota superior de ventanillas a evaluar


@dataclass(frozen=True)
class Metricas:
    """Indicadores de estado estable para c ventanillas."""

    c: int
    rho: float  # utilización
    p0: float  # probabilidad de sistema vacío
    pw: float  # probabilidad de esperar (Erlang C)
    lq: float  # pasajeros promedio en cola
    wq: float  # espera promedio en cola (h)

    @property
    def costo(self) -> float:
        """Costo total por hora: operación + espera."""
        return CS * self.c + CW * self.lq


def mmc(c: int, lam: float = LAMBDA, mu: float = MU) -> Metricas:
    """Resuelve analíticamente una cola M/M/c con la fórmula de Erlang C."""
    a = lam / mu  # intensidad de tráfico
    rho = a / c
    if rho >= 1:
        raise ValueError(f"Sistema inestable con c={c}: rho={rho:.3f} >= 1")

    suma = sum(a**n / math.factorial(n) for n in range(c))
    cola = a**c / (math.factorial(c) * (1 - rho))
    p0 = 1 / (suma + cola)
    pw = cola * p0
    lq = pw * rho / (1 - rho)
    return Metricas(c=c, rho=rho, p0=p0, pw=pw, lq=lq, wq=lq / lam)  # Wq por ley de Little


def resolver() -> tuple[str, int, float]:
    """Formula y resuelve el modelo entero. Devuelve (estado, x*, y*)."""
    x_min = math.floor(LAMBDA / MU) + 1  # menor número de ventanillas estable (rho < 1)
    candidatos = range(x_min, X_MAX + 1)
    costo = {c: mmc(c).costo for c in candidatos}
    x_sla = min(c for c in candidatos if mmc(c).wq <= WQ_MAX)

    prob = pulp.LpProblem("Ventanillas_Migracion", pulp.LpMinimize)
    x = pulp.LpVariable("x", lowBound=x_min, upBound=X_MAX, cat=pulp.LpInteger)
    y = pulp.LpVariable("y", lowBound=0)

    prob += y, "costo_total"

    # CT(x) es convexa en x. Cada secante entre enteros consecutivos es una cota
    # inferior que coincide con CT en esos dos puntos, por lo que en el óptimo y = CT(x).
    for k in candidatos[:-1]:
        pendiente = costo[k + 1] - costo[k]
        prob += y >= costo[k] + pendiente * (x - k), f"secante_{k}_{k + 1}"

    # Wq(x) decrece con x, así que Wq <= 6 min equivale a x >= x_sla.
    prob += x >= x_sla, "nivel_de_servicio"

    prob.solve(pulp.PULP_CBC_CMD(msg=False))
    return pulp.LpStatus[prob.status], round(x.value()), float(y.value())


if __name__ == "__main__":
    print(f"{'x':>3} {'rho':>7} {'Pw':>7} {'Lq':>8} {'Wq (min)':>9} {'CT (USD/h)':>11}")
    for c in range(13, X_MAX + 1):
        m = mmc(c)
        print(f"{c:>3} {m.rho:>7.1%} {m.pw:>7.4f} {m.lq:>8.3f} {m.wq * 60:>9.3f} {m.costo:>11.2f}")

    estado, x_opt, y_opt = resolver()
    print(f"\nEstado: {estado}  ->  x* = {x_opt} ventanillas, y* = {y_opt:.2f} USD/h")
