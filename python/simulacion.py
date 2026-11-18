"""Simulación de eventos discretos del control migratorio con SimPy."""
from __future__ import annotations

import random
import statistics

import simpy

from modelo import CS, CW, LAMBDA, MU, mmc

CALENTAMIENTO = 0.25  # h descartadas al inicio: la sala arranca vacía
Z_95 = 1.96  # intervalo de confianza del 95 % (aprox. normal, >= 30 réplicas)


def pasajero(env: simpy.Environment, ventanillas: simpy.Resource, esperas: list[float]):
    llegada = env.now
    with ventanillas.request() as turno:
        yield turno
        if llegada >= CALENTAMIENTO:
            esperas.append(env.now - llegada)
        yield env.timeout(random.expovariate(MU))  # servicio exponencial, media 4 min


def llegadas(env: simpy.Environment, ventanillas: simpy.Resource, esperas: list[float]):
    while True:
        yield env.timeout(random.expovariate(LAMBDA))  # llegadas de Poisson
        env.process(pasajero(env, ventanillas, esperas))


def replica(x: int, horas: float, semilla: int) -> float:
    """Ejecuta una réplica y devuelve la espera promedio en cola (h)."""
    random.seed(semilla)
    env = simpy.Environment()
    ventanillas = simpy.Resource(env, capacity=x)
    esperas: list[float] = []
    env.process(llegadas(env, ventanillas, esperas))
    env.run(until=CALENTAMIENTO + horas)
    if not esperas:
        raise RuntimeError("No se registraron pasajeros; aumente la duración.")
    return statistics.fmean(esperas)


def simular(x: int, horas: float = 8.0, replicas: int = 30, semilla: int = 2026) -> dict[str, float]:
    """Promedia varias réplicas independientes y estima el costo total."""
    wq = [replica(x, horas, semilla + i) for i in range(replicas)]
    media = statistics.fmean(wq)
    semiancho = Z_95 * statistics.stdev(wq) / replicas**0.5
    lq = LAMBDA * media  # ley de Little
    return {"wq_min": media * 60, "ic_min": semiancho * 60, "costo": CS * x + CW * lq}


if __name__ == "__main__":
    for x in (14, 15, 16):
        r = simular(x)
        teorico = mmc(x).wq * 60
        print(
            f"x={x}: Wq = {r['wq_min']:.3f} ± {r['ic_min']:.3f} min "
            f"(teórico {teorico:.3f})   CT ≈ {r['costo']:.2f} USD/h"
        )
