import { number, positive } from "./numbers.mjs";
export const markets = {
  gold: {
    label: "Oro",
    symbol: "XAUUSD",
    badge: "gold",
    contract: 100,
    tick: 0.01,
    min: 0.01,
    step: 0.01,
  },
  nas: {
    label: "Nasdaq 100",
    symbol: "NAS100",
    badge: "nas",
    contract: 10,
    tick: 0.1,
    min: 0.01,
    step: 0.01,
  },
  us30: {
    label: "Dow Jones",
    symbol: "US30",
    badge: "dow",
    contract: 1,
    tick: 1,
    min: 0.01,
    step: 0.01,
  },
  btc: {
    label: "Bitcoin",
    symbol: "BTCUSD",
    badge: "btc",
    contract: 1,
    tick: 0.01,
    min: 0.01,
    step: 0.01,
  },
};
export const futures = {
  MNQ: {
    name: "Nasdaq 100",
    kind: "Micro",
    badge: "nas",
    point: 2,
    tick: 0.25,
    max: 50,
    fee: 0,
  },
  NQ: {
    name: "Nasdaq 100",
    kind: "E-mini",
    badge: "nas",
    point: 20,
    tick: 0.25,
    max: 5,
    fee: 0,
  },
  MES: {
    name: "S&P 500",
    kind: "Micro",
    badge: "sp",
    point: 5,
    tick: 0.25,
    max: 50,
    fee: 0,
  },
  ES: {
    name: "S&P 500",
    kind: "E-mini",
    badge: "sp",
    point: 50,
    tick: 0.25,
    max: 5,
    fee: 0,
  },
  MYM: {
    name: "Dow Jones",
    kind: "Micro",
    badge: "dow",
    point: 0.5,
    tick: 1,
    max: 50,
    fee: 0,
  },
  YM: {
    name: "Dow Jones",
    kind: "E-mini",
    badge: "dow",
    point: 5,
    tick: 1,
    max: 5,
    fee: 0,
  },
  "1OZ": {
    name: "Oro",
    kind: "1 onza",
    badge: "gold",
    point: 1,
    tick: 0.25,
    max: 50,
    fee: 0,
  },
  MGC: {
    name: "Oro",
    kind: "Micro",
    badge: "gold",
    point: 10,
    tick: 0.1,
    max: 50,
    fee: 0,
  },
  GC: {
    name: "Oro",
    kind: "Estándar",
    badge: "gold",
    point: 100,
    tick: 0.1,
    max: 5,
    fee: 0,
  },
};
export const initial = () => ({
  version: 3,
  profile: { name: "Trader", account: "Mi cuenta" },
  cfd: {
    market: "gold",
    capital: "5000",
    risk: "1",
    riskMode: "pct",
    distance: "25",
    units: "price",
    rr: "3",
    spec: structuredClone(markets),
  },
  futures: {
    market: "MNQ",
    capital: "50000",
    risk: "100",
    riskMode: "usd",
    distance: "20",
    units: "points",
    rr: "3",
    spec: structuredClone(futures),
  },
  consistency: { capital: "5000", limit: "15", minPct: "0.5", required: "6" },
  tools: {
    base: "600",
    pct: "4",
    part: "25",
    whole: "5000",
    source: "gold",
    move: "25",
    ratio: "1",
    pip: "0.01",
    recoveryCapital: "5000",
    loss: "5",
  },
  days: [],
});
export function cfdSize(c) {
  const spec = c.spec[c.market],
    capital = number(c.capital),
    risk = number(c.risk),
    rr = number(c.rr),
    distance = number(c.distance),
    tick = number(spec.tick),
    contract = number(spec.contract),
    min = number(spec.min),
    step = number(spec.step),
    budget = c.riskMode === "pct" ? (capital * risk) / 100 : risk,
    effective = c.units === "ticks" ? Math.ceil(distance) * tick : distance,
    per = effective * contract;
  if (
    !positive(
      capital,
      risk,
      rr,
      distance,
      tick,
      contract,
      min,
      step,
      budget,
      per,
    ) ||
    budget > capital
  )
    return {
      error:
        "Revisa los valores. El riesgo debe ser positivo y no superar el capital.",
    };
  const theoretical = budget / per,
    steps = Math.floor((theoretical - min) / step + 1e-9),
    quantity = steps < 0 ? 0 : Number((min + steps * step).toFixed(8));
  return {
    quantity,
    theoretical,
    budget,
    effective,
    per,
    loss: quantity * per,
    profit: quantity * per * rr,
    minimumRisk: min * per,
    rr,
  };
}
export function futureSize(f) {
  const s = f.spec[f.market],
    capital = number(f.capital),
    risk = number(f.risk),
    rr = number(f.rr),
    tick = number(s.tick),
    point = number(s.point),
    fee = number(s.fee),
    max = number(s.max),
    distance = number(f.distance),
    budget = f.riskMode === "pct" ? (capital * risk) / 100 : risk,
    effective =
      f.units === "ticks"
        ? Math.ceil(distance) * tick
        : Math.ceil(distance / tick - 1e-9) * tick,
    per = effective * point + fee;
  if (
    !positive(capital, risk, rr, tick, point, max, distance, budget, per) ||
    !Number.isFinite(fee) ||
    fee < 0 ||
    budget > capital
  )
    return {
      error: "Revisa el capital, riesgo y especificaciones del contrato.",
    };
  const theoretical = budget / per,
    quantity = Math.max(
      0,
      Math.min(Math.floor(max), Math.floor(theoretical + 1e-10)),
    );
  return {
    quantity,
    theoretical,
    budget,
    effective,
    per,
    loss: quantity * per,
    profit: quantity * (effective * point * rr - fee),
    minimumRisk: per,
    rr,
  };
}
export function consistency(c, days) {
  const capital = number(c.capital),
    limit = number(c.limit),
    minPct = number(c.minPct),
    required = number(c.required),
    total = days.reduce((s, d) => s + d.pnl, 0),
    best = Math.max(0, ...days.map((d) => d.pnl)),
    threshold = (capital * minPct) / 100,
    valid = days.filter((d) => d.pnl >= threshold).length,
    ratio = total > 0 ? (best / total) * 100 : NaN,
    target = limit > 0 ? (best * 100) / limit : NaN;
  return {
    capital,
    limit,
    minPct,
    required,
    total,
    best,
    threshold,
    valid,
    ratio,
    target,
    remaining: Math.max(0, target - total),
    ready: total > 0 && ratio <= limit && valid >= required,
    validConfig:
      positive(capital, limit, minPct, required) &&
      limit <= 100 &&
      Number.isInteger(required),
  };
}
export function recovery(capital, loss) {
  if (!positive(capital) || !Number.isFinite(loss) || loss < 0 || loss > 100)
    return null;
  return {
    remaining: capital * (1 - loss / 100),
    lost: (capital * loss) / 100,
    percent: loss === 100 ? Infinity : (loss / (100 - loss)) * 100,
  };
}
const scalar = (v) =>
  typeof v === "string" || (typeof v === "number" && Number.isFinite(v));
export function validateBackup(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw Error("Respaldo no válido.");
  const clean = initial();
  for (const g of ["cfd", "futures", "consistency", "tools", "profile"])
    if (raw[g] && typeof raw[g] === "object")
      for (const k of Object.keys(clean[g])) {
        if (k === "spec") continue;
        if (scalar(raw[g][k])) clean[g][k] = String(raw[g][k]).slice(0, 120);
      }
  for (const [g, defs] of [
    ["cfd", markets],
    ["futures", futures],
  ]) {
    if (!Object.hasOwn(defs, clean[g].market))
      throw Error("Instrumento desconocido.");
    for (const id of Object.keys(defs))
      for (const key of Object.keys(defs[id]))
        if (
          typeof defs[id][key] === "number" &&
          scalar(raw[g]?.spec?.[id]?.[key])
        )
          clean[g].spec[id][key] = raw[g].spec[id][key];
  }
  if (
    !["pct", "usd"].includes(clean.cfd.riskMode) ||
    !["pct", "usd"].includes(clean.futures.riskMode) ||
    !["price", "ticks"].includes(clean.cfd.units) ||
    !["points", "ticks"].includes(clean.futures.units) ||
    !["gold", "nas"].includes(clean.tools.source)
  )
    throw Error("Configuración no válida.");
  const source = raw.version === 1 ? raw.consistency?.days : raw.days;
  if (source !== undefined && !Array.isArray(source))
    throw Error("Historial no válido.");
  if ((source?.length || 0) > 1000)
    throw Error("Máximo 1,000 días por respaldo.");
  const ids = new Set(),
    dates = new Set();
  clean.days = (source || []).map((d, i) => {
    const legacy = typeof d === "number",
      date = legacy
        ? new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10)
        : d?.date,
      pnl = legacy ? d : d?.pnl,
      id = legacy ? crypto.randomUUID() : d?.id;
    if (
      !Number.isFinite(pnl) ||
      Math.abs(pnl) > 1e12 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(date).toISOString().slice(0, 10) !== date ||
      !/^([a-f0-9]{8}-)([a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id) ||
      ids.has(id) ||
      dates.has(date)
    )
      throw Error("Hay días inválidos o repetidos.");
    ids.add(id);
    dates.add(date);
    return {
      id,
      date,
      pnl,
      note: legacy
        ? "Importado: fecha de referencia"
        : String(d.note || "").slice(0, 300),
    };
  });
  return clean;
}
