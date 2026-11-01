import { ArrowLeftRight, Percent, RotateCcw } from "lucide-react";
import { Card, Field, Metric, Notice, Select } from "../components/ui";
import { fmt, number, usd } from "../lib/numbers.mjs";
import { recovery } from "../lib/trading.mjs";
export default function Tools({ data, update }) {
  const t = data.tools,
    set = (k, v) =>
      update((s) => {
        s.tools[k] = v;
        return s;
      }),
    base = number(t.base),
    pct = number(t.pct),
    part = (base * pct) / 100,
    whole = number(t.whole),
    value = number(t.part),
    move = number(t.move),
    ratio = number(t.ratio),
    pip = number(t.pip),
    valid =
      Number.isFinite(move) && move >= 0 && ratio > 0 && Number.isFinite(ratio),
    gold = valid ? (t.source === "gold" ? move : move / ratio) : NaN,
    nas = valid ? (t.source === "gold" ? move * ratio : move) : NaN,
    rec = recovery(number(t.recoveryCapital), number(t.loss));
  return (
    <div className="tools-grid">
      <Card title="Porcentajes" action={<Percent size={18} />}>
        <div className="fields">
          <Field
            label="Cantidad ($)"
            value={t.base}
            onChange={(v) => set("base", v)}
          />
          <Field
            label="Porcentaje (%)"
            value={t.pct}
            onChange={(v) => set("pct", v)}
          />
        </div>
        <div className="tool-result">
          <span>
            {t.pct}% de {usd(base)}
          </span>
          <strong>{usd(part)}</strong>
        </div>
        <div className="result-metrics">
          <Metric label="Sumar porcentaje" value={usd(base + part)} />
          <Metric label="Restar porcentaje" value={usd(base - part)} />
        </div>
        <div className="divider" />
        <h3>¿Qué porcentaje representa?</h3>
        <div className="fields">
          <Field
            label="Valor"
            value={t.part}
            onChange={(v) => set("part", v)}
          />
          <Field
            label="Total"
            value={t.whole}
            onChange={(v) => set("whole", v)}
          />
        </div>
        <div className="tool-result compact">
          <span>Proporción del total</span>
          <strong>
            {whole !== 0 && Number.isFinite(whole)
              ? fmt((value / whole) * 100, 4)
              : "—"}
            %
          </strong>
        </div>
      </Card>
      <Card title="Oro ↔ Nasdaq" action={<ArrowLeftRight size={18} />}>
        <div className="fields">
          <Select
            label="Convertir desde"
            value={t.source}
            onChange={(v) => set("source", v)}
            options={[
              ["gold", "Oro · XAUUSD"],
              ["nas", "Nasdaq · NAS100"],
            ]}
          />
          <Field
            label="Movimiento (puntos)"
            value={t.move}
            onChange={(v) => set("move", v)}
          />
          <Field
            label="Puntos NAS por 1 punto de Oro"
            value={t.ratio}
            onChange={(v) => set("ratio", v)}
          />
          <Field
            label="Tamaño de pip en Oro"
            value={t.pip}
            onChange={(v) => set("pip", v)}
          />
        </div>
        <div className="tool-result">
          <span>Referencia configurada</span>
          <strong>
            {fmt(t.source === "gold" ? nas : gold, 4)}
            <small> pts {t.source === "gold" ? "NAS" : "XAU"}</small>
          </strong>
        </div>
        <p className="caption">
          {pip > 0 && Number.isFinite(pip) ? fmt(gold / pip, 3) : "—"} pips de
          Oro según el tamaño configurado.
        </p>
        <Notice>
          Relación numérica personal, sin cotización en vivo. No implica que
          ambos mercados se muevan igual ni tengan el mismo valor monetario.
        </Notice>
      </Card>
      <Card title="Recuperar una pérdida" action={<RotateCcw size={18} />}>
        <div className="fields">
          <Field
            label="Capital inicial ($)"
            value={t.recoveryCapital}
            onChange={(v) => set("recoveryCapital", v)}
          />
          <Field
            label="Pérdida (%)"
            value={t.loss}
            onChange={(v) => set("loss", v)}
          />
        </div>
        <div className="tool-result">
          <span>Retorno necesario para recuperar</span>
          <strong>
            {rec
              ? rec.percent === Infinity
                ? "∞"
                : fmt(rec.percent) + "%"
              : "—"}
          </strong>
        </div>
        <div className="result-metrics">
          <Metric label="Capital restante" value={usd(rec?.remaining)} />
          <Metric label="Monto por recuperar" value={usd(rec?.lost)} />
        </div>
        <Notice>
          {!rec
            ? "Usa un capital positivo y una pérdida entre 0% y 100%."
            : rec.percent === Infinity
              ? "Con saldo cero no existe un retorno porcentual finito que recupere el capital."
              : `Para recuperar ${usd(rec.lost)}, necesitas ganar ${fmt(rec.percent)}% sobre ${usd(rec.remaining)}.`}
        </Notice>
      </Card>
    </div>
  );
}
