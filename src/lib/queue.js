/**
 * Modelo analítico M/M/c (Erlang C).
 * Tiempos en horas; los consumidores convierten a minutos/segundos.
 */
export function mmc(c, { lambda, mu, cs, cw, wqMaxH }) {
  const a = lambda / mu; // intensidad de tráfico (erlangs)
  const rho = a / c;
  const serviceCost = cs * c;

  if (rho >= 1) {
    return {
      c, a, rho, stable: false, serviceCost,
      P0: 0, Pw: 1, Lq: Infinity, L: Infinity, Wq: Infinity, W: Infinity,
      waitCost: Infinity, totalCost: Infinity, meetsSla: false,
    };
  }

  // Suma de a^n/n! para n < c, acumulada término a término (sin factoriales grandes)
  let term = 1;
  let sum = 1;
  for (let n = 1; n < c; n++) {
    term *= a / n;
    sum += term;
  }
  const termC = (term * a) / c; // a^c / c!
  const tail = termC / (1 - rho);
  const P0 = 1 / (sum + tail);
  const Pw = tail * P0; // probabilidad de esperar (Erlang C)
  const Lq = (Pw * rho) / (1 - rho);
  const Wq = Lq / lambda; // Ley de Little
  const waitCost = cw * Lq;

  return {
    c, a, rho, stable: true, serviceCost,
    P0, Pw, Lq, L: Lq + a, Wq, W: Wq + 1 / mu,
    waitCost, totalCost: serviceCost + waitCost, meetsSla: Wq <= wqMaxH,
  };
}

export function scenarios(params, from = params.xMin, to = params.xMax) {
  const out = [];
  for (let c = from; c <= to; c++) out.push(mmc(c, params));
  return out;
}

/**
 * Equivalente al modelo PuLP: minimiza y = CT(x) con x entero y Wq(x) <= SLA.
 * Como CT es convexa en x, las secantes entre enteros consecutivos (cortes
 * y >= f(k) + (f(k+1) - f(k))(x - k)) la representan exactamente en enteros.
 */
export function optimize(params) {
  const all = scenarios(params);
  const feasible = all.filter((s) => s.stable && s.meetsSla);
  if (!feasible.length) return { status: 'Infeasible', all, feasible, cuts: [] };

  const best = feasible.reduce((m, s) => (s.totalCost < m.totalCost ? s : m));
  const cuts = [];
  for (let i = 0; i < feasible.length - 1; i++) {
    const f0 = feasible[i];
    const f1 = feasible[i + 1];
    const slope = f1.totalCost - f0.totalCost;
    cuts.push({ k: f0.c, slope, intercept: f0.totalCost - slope * f0.c });
  }
  return {
    status: 'Optimal',
    x: best.c,
    y: best.totalCost,
    best,
    xSla: feasible[0].c,
    all,
    feasible,
    cuts,
  };
}

/** Comparación contra el escenario actual (16 ventanillas). */
export function savings(params, best) {
  const base = mmc(params.baseWindows, params);
  const perHourReported = params.reportedBaseCost - best.totalCost;
  const perHourTheoretical = base.totalCost - best.totalCost;
  const hoursPerYear = params.peakHoursPerDay * params.daysPerYear;
  const annual = perHourReported * hoursPerYear;

  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let acc = 0;
  const cumulativeMonthly = daysInMonth.map((d) => (acc += perHourReported * params.peakHoursPerDay * d));

  return {
    base,
    perHourReported,
    pctReported: perHourReported / params.reportedBaseCost,
    perHourTheoretical,
    pctTheoretical: perHourTheoretical / base.totalCost,
    waitDeltaH: best.Wq - base.Wq,
    hoursPerYear,
    annual,
    cumulativeMonthly,
  };
}
