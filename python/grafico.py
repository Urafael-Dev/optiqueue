"""Gráfico analítico: tiempo de espera frente a costo total."""
import matplotlib.pyplot as plt

from modelo import CS, CW, WQ_MAX, X_MAX, mmc

xs = list(range(13, X_MAX + 1))
metricas = [mmc(c) for c in xs]
costo_total = [m.costo for m in metricas]
costo_operacion = [CS * c for c in xs]
costo_espera = [CW * m.lq for m in metricas]
espera_min = [m.wq * 60 for m in metricas]

i_opt = costo_total.index(min(costo_total))
x_opt, y_opt = xs[i_opt], costo_total[i_opt]

fig, ax = plt.subplots(figsize=(10, 5.5), constrained_layout=True)
ax.plot(xs, costo_total, "o-", lw=2.5, color="#2f5bd3", label="Costo total")
ax.plot(xs, costo_operacion, "--", color="#94a3b8", label="Costo de ventanillas")
ax.plot(xs, costo_espera, "-", color="#c2410c", label="Costo de espera")
ax.axvspan(x_opt - 0.35, x_opt + 0.35, color="#2f5bd3", alpha=0.08)
ax.annotate(
    f"x* = {x_opt}\n{y_opt:.2f} USD/h",
    xy=(x_opt, y_opt), xytext=(0, -50), textcoords="offset points",
    ha="center", arrowprops={"arrowstyle": "->", "color": "#2f5bd3"},
)
ax.set_xlabel("Ventanillas abiertas (x)")
ax.set_ylabel("Costo (USD/h)")
ax.set_ylim(bottom=0)

# Eje derecho: la línea del SLA se dibuja en los 6 min reales.
ax2 = ax.twinx()
ax2.plot(xs, espera_min, "-", color="#157f4b", label="Espera Wq (min)")
ax2.axhline(WQ_MAX * 60, color="#c02626", ls=":", label="Límite: 6 min")
ax2.set_ylim(0, WQ_MAX * 60 * 1.15)
ax2.set_ylabel("Espera promedio en cola (min)")

for eje in (ax, ax2):
    eje.spines["top"].set_visible(False)
h1, l1 = ax.get_legend_handles_labels()
h2, l2 = ax2.get_legend_handles_labels()
ax.legend(h1 + h2, l1 + l2, loc="upper center", bbox_to_anchor=(0.5, -0.13), ncol=5, frameon=False)
ax.set_title("Modelo M/M/c: costo total y tiempo de espera (λ = 180, μ = 15)")

fig.savefig("grafico_analitico.png", dpi=200)
print("Gráfico guardado en grafico_analitico.png")
