import {
  ArrowUpRight,
  ArrowRight,
  Calculator,
  ChartNoAxesCombined,
  Target,
  ArrowLeftRight,
  ShieldCheck,
  Wallet,
  TrendingUp,
  BookOpen,
  Clock3,
} from "lucide-react";
import { Card, Metric, Progress } from "../components/ui";
import EquityChart from "../components/EquityChart";
import { cfdSize, consistency } from "../lib/trading.mjs";
import { fmt, usd } from "../lib/numbers.mjs";
export default function Home({ data, go, online }) {
  const m = consistency(data.consistency, data.days),
    r = cfdSize(data.cfd),
    links = [
      ["cfd", "Calcular lotaje", "Dimensiona tu próxima entrada", Calculator],
      [
        "futures",
        "Futuros",
        "Encuentra tu número de contratos",
        ChartNoAxesCombined,
      ],
      ["consistency", "Registrar mi día", "Construye tu historial", Target],
      ["tools", "Utilidades", "Porcentajes y recuperación", ArrowLeftRight],
      [
        "learn",
        "Aprende de trading",
        "Un espacio para seguir creciendo",
        BookOpen,
      ],
    ];
  return (
    <>
      <div className="welcome-row">
        <div>
          <span className="eyebrow">TU CENTRO DE OPERACIONES</span>
          <h1>
            Bienvenido, {data.profile.name || "Trader"}
            <span className="accent">.</span>
          </h1>
          <p>Una buena operación empieza con un buen plan.</p>
        </div>
        <span className="chip">
          <span className="dot green" />
          {online ? "Modo conectado" : "Disponible sin conexión"}
        </span>
      </div>
      <div className="hero">
        <div>
          <span className="hero-label">
            <ShieldCheck size={14} /> GESTIÓN INTELIGENTE DEL RIESGO
          </span>
          <h2>
            Tu capital merece
            <br />
            <span>una estrategia.</span>
          </h2>
          <p>Calcula con precisión. Opera con disciplina.</p>
          <button className="button primary" onClick={() => go("cfd")}>
            Preparar operación
            <ArrowUpRight size={17} />
          </button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="hero-candles">
            {[60, 100, 78, 150, 115, 185].map((v, i) => (
              <i
                key={i}
                style={{ height: v, animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <span className="art-caption">PRECISION / DISCIPLINE / GROWTH</span>
        </div>
      </div>
      <div className="metrics-grid">
        <Metric
          icon={Wallet}
          label="Capital base CFD"
          value={usd(Number(String(data.cfd.capital).replaceAll(",", "")))}
          note={data.profile.account}
        />
        <Metric
          icon={ShieldCheck}
          label="Riesgo por operación"
          value={usd(r.budget)}
          note="Según tu configuración CFD"
          tone="accent"
        />
        <Metric
          icon={TrendingUp}
          label="Beneficio registrado"
          value={usd(m.total)}
          tone={m.total < 0 ? "negative" : "positive"}
          note="Neto de tus días"
        />
        <Metric
          icon={Target}
          label="Días objetivo"
          value={`${m.valid} / ${data.consistency.required}`}
          note={`Desde ${data.consistency.minPct}% al día`}
        />
      </div>
      <div className="dashboard-grid">
        <Card
          title="Así evoluciona tu cuenta"
          action={<span className="chip">Registro real</span>}
        >
          <EquityChart
            capital={Number.isFinite(m.capital) ? m.capital : 0}
            days={data.days}
          />
        </Card>
        <Card title="Tu siguiente paso" className="quick-card">
          <div className="quick-links">
            {links.map(([id, label, note, Icon]) => (
              <button key={id} onClick={() => go(id)}>
                <span className="quick-icon">
                  <Icon size={19} />
                </span>
                <span>
                  <strong>{label}</strong>
                  <small>{note}</small>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
        </Card>
      </div>
      <div className="home-bottom">
        <Card title="Disciplina que se construye">
          <div className="progress-heading">
            <strong>
              {m.valid}
              <small> / {data.consistency.required} días</small>
            </strong>
            <span className="muted">{usd(m.threshold)} / día</span>
          </div>
          <Progress value={(m.valid / m.required) * 100} />
          <p className="caption">Cada día que respetas tu plan cuenta.</p>
        </Card>
        <Card title="Consistencia">
          <div className="progress-heading">
            <strong className={m.ratio > m.limit ? "negative" : ""}>
              {Number.isFinite(m.ratio) ? fmt(m.ratio, 1) + "%" : "—"}
            </strong>
            <span className="muted">Límite {data.consistency.limit}%</span>
          </div>
          <Progress value={m.ratio} />
          <p className="caption">Mejor día sobre el beneficio neto.</p>
        </Card>
        <Card title="Encuentra tu momento">
          <div className="sessions-mini">
            <Clock3 size={25} />
            <div>
              <strong>Tokio · Londres · Nueva York</strong>
              <p className="caption">
                Horarios ajustados a República Dominicana.
              </p>
            </div>
          </div>
          <button className="text-button" onClick={() => go("sessions")}>
            Explorar sesiones
            <ArrowRight size={14} />
          </button>
        </Card>
      </div>
    </>
  );
}
