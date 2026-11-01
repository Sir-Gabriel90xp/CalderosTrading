import { useState, useEffect } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Info,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Field,
  Metric,
  Notice,
  RR,
  Select,
  SelectedCheck,
} from "../components/ui";
import { cfdSize, futureSize, futures, markets } from "../lib/trading.mjs";
import { fmt, number, usd } from "../lib/numbers.mjs";
export default function Calculators({ mode, data, update, openSpecs }) {
  const c = data[mode],
    isFuture = mode === "futures",
    result = isFuture ? futureSize(c) : cfdSize(c),
    [copied, setCopied] = useState(false),
    defs = isFuture ? futures : markets,
    spec = c.spec[c.market];
  function set(key, value) {
    update((s) => {
      s[mode][key] = value;
      return s;
    });
  }
  function setSpec(key, value) {
    update((s) => {
      s[mode].spec[c.market][key] = value;
      return s;
    });
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(String(result.quantity));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  useEffect(() => {
    if (openSpecs && !isFuture) {
      const el = document.getElementById("broker-specs");
      if (el) {
        el.open = true;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }, [openSpecs, isFuture]);
  return (
    <div className="calculator-layout">
      <div className="stack">
        <Card
          title={
            isFuture ? "¿Qué mercado vas a operar?" : "Selecciona tu activo"
          }
        >
          <div className={isFuture ? "contract-groups" : "asset-grid"}>
            {isFuture
              ? ["Nasdaq 100", "S&P 500", "Dow Jones", "Oro"].map((name) => (
                  <div className="contract-group" key={name}>
                    <h3>
                      <Badge
                        kind={
                          Object.values(futures).find((f) => f.name === name)
                            .badge
                        }
                      />
                      {name}
                    </h3>
                    <div className="contract-options">
                      {Object.entries(futures)
                        .filter(([, f]) => f.name === name)
                        .map(([id, f]) => (
                          <button
                            className={`contract-option ${c.market === id ? "selected" : ""}`}
                            key={id}
                            aria-pressed={c.market === id}
                            onClick={() => set("market", id)}
                          >
                            <span>
                              {f.kind}
                              <SelectedCheck active={c.market === id} />
                            </span>
                            <strong>{id}</strong>
                            <small>{usd(number(c.spec[id].point))}/pt</small>
                          </button>
                        ))}
                    </div>
                  </div>
                ))
              : Object.entries(markets).map(([id, m]) => (
                  <button
                    className={`asset-option ${c.market === id ? "selected" : ""}`}
                    key={id}
                    onClick={() => set("market", id)}
                    aria-pressed={c.market === id}
                  >
                    <Badge kind={m.badge} />
                    <span>
                      <strong>{m.label}</strong>
                      <small>{m.symbol}</small>
                    </span>
                    <SelectedCheck active={c.market === id} />
                  </button>
                ))}
          </div>
        </Card>
        <Card
          title="Configura la operación"
          action={
            <span className="chip">
              {isFuture ? c.market : defs[c.market].symbol}
            </span>
          }
        >
          <div className="segmented">
            <button
              className={c.riskMode === "pct" ? "selected" : ""}
              onClick={() => {
                const amount = number(c.risk),
                  cap = number(c.capital);
                update((s) => {
                  if (s[mode].riskMode !== "pct" && cap > 0)
                    s[mode].risk = String(
                      Math.round((amount / cap) * 100 * 1e6) / 1e6,
                    );
                  s[mode].riskMode = "pct";
                  return s;
                });
              }}
            >
              % Riesgo
            </button>
            <button
              className={c.riskMode === "usd" ? "selected" : ""}
              onClick={() => {
                update((s) => {
                  if (s[mode].riskMode !== "usd")
                    s[mode].risk = String(
                      Math.round(
                        ((number(c.capital) * number(c.risk)) / 100) * 1e6,
                      ) / 1e6,
                    );
                  s[mode].riskMode = "usd";
                  return s;
                });
              }}
            >
              $ Riesgo
            </button>
          </div>
          <div className="fields">
            <Field
              label="Capital de cuenta ($)"
              value={c.capital}
              onChange={(v) => set("capital", v)}
            />
            <Field
              label={`Riesgo (${c.riskMode === "pct" ? "%" : "$"})`}
              value={c.risk}
              onChange={(v) => set("risk", v)}
            />
            <Field
              label="Distancia del stop loss"
              value={c.distance}
              onChange={(v) => set("distance", v)}
            />
            <Select
              label="Unidad del stop"
              value={c.units}
              onChange={(v) => set("units", v)}
              options={
                isFuture
                  ? [
                      ["points", "Puntos"],
                      ["ticks", "Ticks"],
                    ]
                  : [
                      ["price", "Puntos de precio"],
                      ["ticks", "Ticks"],
                    ]
              }
            />
            <RR value={c.rr} onChange={(v) => set("rr", v)} />
          </div>
          <details id="broker-specs">
            <summary>
              <Info size={15} />
              {isFuture
                ? "Especificaciones y comisiones"
                : "Especificaciones de tu bróker"}
              <ChevronDown size={14} />
            </summary>
            <div className="fields">
              {(isFuture
                ? [
                    ["point", "Valor por punto ($)"],
                    ["tick", "Tamaño de tick"],
                    ["max", "Máximo de contratos"],
                    ["fee", "Comisión total / contrato ($)"],
                  ]
                : [
                    ["contract", "Unidades por lote"],
                    ["tick", "Tamaño de tick"],
                    ["min", "Lote mínimo"],
                    ["step", "Incremento de lote"],
                  ]
              ).map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  value={spec[key]}
                  onChange={(v) => setSpec(key, v)}
                />
              ))}
            </div>
          </details>
          {!isFuture && (
            <Notice>
              <ShieldCheck size={17} />
              Confirma las unidades por lote, tick y volumen permitido en tu
              bróker. Pueden variar por activo y cuenta.
            </Notice>
          )}
        </Card>
      </div>
      <div className="stack result-column">
        <Card className="result-card">
          <div className="eyebrow">TU POSICIÓN, BAJO CONTROL</div>
          <p className="result-label">
            {isFuture ? "Contratos sugeridos" : "Volumen sugerido"}
          </p>
          <div className="result-number">
            {result.error ? "—" : fmt(result.quantity, 8)}
            <small>{isFuture ? "contratos" : "lotes"}</small>
          </div>
          <span className="chip">
            <ShieldCheck size={13} /> Riesgo {usd(result.budget)}
          </span>
          <div className="result-metrics">
            <Metric
              label="Pérdida estimada"
              value={usd(-result.loss)}
              tone="negative"
            />
            <Metric
              label={`Objetivo · 1:${c.rr}`}
              value={usd(result.profit)}
              tone="positive"
            />
          </div>
          {result.error ? (
            <Notice tone="error">{result.error}</Notice>
          ) : result.quantity === 0 ? (
            <Notice tone="error">
              El volumen mínimo expone {usd(result.minimumRisk)}. Supera tu
              presupuesto.
            </Notice>
          ) : (
            <p className="caption">
              <Check size={13} /> Redondeado hacia abajo para respetar tu
              riesgo.
            </p>
          )}
          <Button
            primary
            className="full"
            disabled={!!result.error || !result.quantity}
            onClick={copy}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
            {copied
              ? "Copiado"
              : "Copiar " + (isFuture ? "contratos" : "lotaje")}
          </Button>
        </Card>
        <Card title="La operación en números">
          <div className="detail-row">
            <span>Riesgo por {isFuture ? "contrato" : "lote"}</span>
            <strong>{usd(result.per)}</strong>
          </div>
          <div className="detail-row">
            <span>Distancia efectiva</span>
            <strong>{fmt(result.effective, 6)} pts</strong>
          </div>
          <div className="detail-row">
            <span>Volumen teórico</span>
            <strong>{fmt(result.theoretical, 6)}</strong>
          </div>
          <p className="caption">
            Estimación sin deslizamiento
            {isFuture
              ? ". Comisión configurada incluida."
              : ", spread ni comisiones."}
          </p>
        </Card>
        <div className="discipline-note">
          <TrendingUp size={19} />
          <p>
            Tu ventaja empieza por
            <br />
            <strong>proteger tu capital.</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
