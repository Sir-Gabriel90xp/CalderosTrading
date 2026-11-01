import { fmt, usd } from "../lib/numbers.mjs";
export default function EquityChart({ capital, days }) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date)),
    values = [capital];
  for (const d of sorted) values.push(values.at(-1) + d.pnl);
  const lo = Math.min(...values),
    hi = Math.max(...values),
    pad = Math.max((hi - lo) * 0.2, capital * 0.005, 1),
    min = lo - pad,
    max = hi + pad,
    x = (i) => 60 + (i * 620) / Math.max(values.length - 1, 1),
    y = (v) => 200 - ((v - min) / (max - min)) * 170,
    line = values.map((v, i) => (i ? "L" : "M") + x(i) + "," + y(v)).join(" ");
  return (
    <>
      <div className="chart-summary">
        <strong>{usd(values.at(-1))}</strong>
        <span className={values.at(-1) >= capital ? "positive" : "negative"}>
          {capital > 0 ? fmt((values.at(-1) / capital - 1) * 100) : "—"}%
        </span>
      </div>
      <svg
        className="equity-chart"
        viewBox="0 0 710 240"
        role="img"
        aria-label={`Evolución de tu cuenta en ${days.length} días registrados`}
      >
        <defs>
          <linearGradient id="equity-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="var(--accent)" stopOpacity=".26" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {Array.from({ length: 4 }, (_, i) => {
          const v = min + ((max - min) * i) / 3;
          return (
            <g key={i}>
              <line x1="60" x2="680" y1={y(v)} y2={y(v)} stroke="var(--line)" />
              <text x="0" y={y(v) + 4} fill="var(--muted)" fontSize="11">
                {fmt(v, 0)}
              </text>
            </g>
          );
        })}
        {days.length > 0 ? (
          <>
            <path
              d={`${line} L680,200 L60,200Z`}
              fill="url(#equity-gradient)"
            />
            <path
              className="equity-line"
              d={line}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <circle cx="680" cy={y(values.at(-1))} r="4" fill="var(--accent)" />
          </>
        ) : (
          <line
            x1="60"
            x2="680"
            y1={y(capital)}
            y2={y(capital)}
            stroke="var(--accent)"
            strokeDasharray="4 8"
          />
        )}
        <text x="60" y="231" fill="var(--muted)" fontSize="11">
          Inicio
        </text>
        <text
          x="680"
          y="231"
          textAnchor="end"
          fill="var(--muted)"
          fontSize="11"
        >
          {days.length} días
        </text>
      </svg>
      {!days.length && (
        <p className="caption center">
          Tu curva comienza con tu primer día registrado.
        </p>
      )}
    </>
  );
}
