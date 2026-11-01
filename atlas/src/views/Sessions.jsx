import { useEffect, useState } from "react";
import { Globe2, Clock3 } from "lucide-react";
import { Card, Notice } from "../components/ui";
const sessions = [
  {
    name: "Tokio",
    city: "Japón",
    zone: "Asia/Tokyo",
    start: 9,
    end: 18,
    code: "JP",
  },
  {
    name: "Londres",
    city: "Reino Unido",
    zone: "Europe/London",
    start: 8,
    end: 17,
    code: "UK",
  },
  {
    name: "Nueva York",
    city: "Estados Unidos",
    zone: "America/New_York",
    start: 8,
    end: 17,
    code: "US",
  },
];
function parts(date, zone) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  );
}
function at(day, hour, zone) {
  const target = Date.UTC(day.year, day.month - 1, day.day, hour);
  let instant = target;
  for (let i = 0; i < 5; i++) {
    const p = parts(new Date(instant), zone),
      diff =
        target -
        Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    instant += diff;
    if (!diff) break;
  }
  return new Date(instant);
}
export default function Sessions() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const rd = new Intl.DateTimeFormat("es-DO", {
    timeZone: "America/Santo_Domingo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return (
    <>
      <Card className="session-clock">
        <div>
          <span className="eyebrow">REPÚBLICA DOMINICANA · UTC−4</span>
          <h2>
            {new Intl.DateTimeFormat("es-DO", {
              timeZone: "America/Santo_Domingo",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            }).format(now)}
          </h2>
          <p className="muted">
            {new Intl.DateTimeFormat("es-DO", {
              timeZone: "America/Santo_Domingo",
              dateStyle: "full",
            }).format(now)}
          </p>
        </div>
        <Globe2 size={100} strokeWidth={0.5} />
      </Card>
      <div className="session-grid">
        {sessions.map((s) => {
          const day = parts(now, s.zone),
            weekday = new Date(
              Date.UTC(day.year, day.month - 1, day.day),
            ).getUTCDay(),
            weekend = weekday === 0 || weekday === 6,
            open = at(day, s.start, s.zone),
            close = at(day, s.end, s.zone),
            active = !weekend && now >= open && now < close;
          return (
            <Card key={s.zone}>
              <div className="session-heading">
                <span className="city-badge">{s.code}</span>
                <span className={`chip ${active ? "positive" : ""}`}>
                  <i className={`dot ${active ? "green" : ""}`} />
                  {weekend
                    ? "Fin de semana"
                    : active
                      ? "En horario"
                      : "Fuera de horario"}
                </span>
              </div>
              <h2>{s.name}</h2>
              <p className="muted">{s.city}</p>
              <div className="session-time">
                {new Intl.DateTimeFormat("en-GB", {
                  timeZone: s.zone,
                  hour: "2-digit",
                  minute: "2-digit",
                  hourCycle: "h23",
                }).format(now)}
              </div>
              <div className="detail-row">
                <span>Horario en RD</span>
                <strong>
                  {rd.format(open)} – {rd.format(close)}
                </strong>
              </div>
              {active && (
                <p className="caption">
                  Cierra en {Math.floor((close - now) / 3600000)} h{" "}
                  {Math.floor(((close - now) % 3600000) / 60000)} min
                </p>
              )}
            </Card>
          );
        })}
      </div>
      <Notice>
        <Clock3 size={17} />
        Ventanas orientativas por sesión, ajustadas al cambio de hora de cada
        ciudad. No contemplan feriados, cierres ni horarios particulares de cada
        instrumento.
      </Notice>
    </>
  );
}
