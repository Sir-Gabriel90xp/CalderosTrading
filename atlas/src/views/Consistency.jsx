import { useState } from "react";
import {
  CalendarDays,
  Check,
  Download,
  Pencil,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import {
  Button,
  Card,
  Empty,
  Field,
  Metric,
  Modal,
  Notice,
  Progress,
} from "../components/ui";
import { consistency } from "../lib/trading.mjs";
import { fmt, number, usd } from "../lib/numbers.mjs";
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Santo_Domingo" });
export default function Consistency({ data, update }) {
  const c = data.consistency,
    m = consistency(c, data.days),
    [edit, setEdit] = useState(null),
    [date, setDate] = useState(today),
    [pnl, setPnl] = useState(""),
    [note, setNote] = useState(""),
    [error, setError] = useState("");
  function set(k, v) {
    update((s) => {
      s.consistency[k] = v;
      return s;
    });
  }
  function open(day) {
    setEdit(day || { id: crypto.randomUUID() });
    setDate(day?.date || today());
    setPnl(day ? String(day.pnl) : "");
    setNote(day?.note || "");
    setError("");
  }
  function submit(e) {
    e.preventDefault();
    const amount = number(pnl);
    if (!Number.isFinite(amount) || Math.abs(amount) > 1e12)
      return setError("Escribe un resultado válido.");
    if (!date || data.days.some((d) => d.date === date && d.id !== edit.id))
      return setError(
        "Ya existe un resultado para esa fecha. Edítalo para incluir el total diario.",
      );
    if (data.days.length >= 1000 && !data.days.some((d) => d.id === edit.id))
      return setError("Límite de 1,000 días. Exporta tu respaldo.");
    update((s) => {
      s.days = [
        ...s.days.filter((d) => d.id !== edit.id),
        { id: edit.id, date, pnl: amount, note: note.slice(0, 300) },
      ];
      return s;
    });
    setEdit(null);
  }
  return (
    <>
      <div className="metrics-grid">
        <Metric
          label="Beneficio neto"
          value={usd(m.total)}
          tone={m.total < 0 ? "negative" : "positive"}
        />
        <Metric
          label="Mejor día / neto"
          value={Number.isFinite(m.ratio) ? fmt(m.ratio) + "%" : "—"}
          note={`Límite ${c.limit}%`}
          tone={m.ratio > m.limit ? "negative" : ""}
        />
        <Metric
          label="Días válidos"
          value={`${m.valid} / ${c.required}`}
          note={`Mínimo ${usd(m.threshold)} por día`}
        />
        <Metric
          label="Beneficio adicional"
          value={usd(m.remaining)}
          note="Si el mejor día no aumenta"
        />
      </div>
      <div className="journal-layout">
        <Card
          title="Tu disciplina, día a día"
          action={
            <Button primary onClick={() => open()}>
              <Plus size={16} />
              Registrar día
            </Button>
          }
        >
          <Progress value={(m.valid / m.required) * 100} />
          <div className="progress-caption">
            <span>{m.valid} días cumplen tu objetivo</span>
            <span>{fmt((m.valid / m.required) * 100, 0)}%</span>
          </div>
          {!data.days.length ? (
            <Empty>Registra el resultado neto de tu primera sesión.</Empty>
          ) : (
            <div className="journal-table">
              <div className="journal-row table-head">
                <span>Fecha</span>
                <span>Resultado</span>
                <span>Objetivo</span>
                <span />
              </div>
              {[...data.days]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((day) => (
                  <div className="journal-row" key={day.id}>
                    <span>
                      <strong>
                        {new Date(day.date + "T12:00:00").toLocaleDateString(
                          "es-DO",
                          { day: "2-digit", month: "short", year: "numeric" },
                        )}
                      </strong>
                      {day.note && <small>{day.note}</small>}
                    </span>
                    <strong className={day.pnl < 0 ? "negative" : "positive"}>
                      {usd(day.pnl)}
                    </strong>
                    <span>
                      {day.pnl >= m.threshold ? (
                        <span className="chip positive">
                          <Check size={12} />
                          Válido
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </span>
                    <span className="row-actions">
                      <button
                        className="icon-button"
                        aria-label={"Editar " + day.date}
                        onClick={() => open(day)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={"Eliminar " + day.date}
                        onClick={() => {
                          if (
                            confirm(
                              "¿Eliminar el resultado del " + day.date + "?",
                            )
                          )
                            update((s) => {
                              s.days = s.days.filter((d) => d.id !== day.id);
                              return s;
                            });
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </div>
                ))}
            </div>
          )}
          <Notice>
            {!m.validConfig
              ? "Revisa tu configuración. Usa porcentajes positivos y días enteros."
              : m.ready
                ? "Cumples los objetivos configurados. Confirma las reglas de tu firma antes de solicitar un retiro."
                : m.total <= 0
                  ? "La consistencia se calcula cuando el beneficio neto es positivo."
                  : m.ratio > m.limit
                    ? "Tu mejor día supera el límite configurado. Sigue tu plan y revisa el beneficio adicional necesario."
                    : "Estás dentro del límite de consistencia. Continúa registrando tus días."}
          </Notice>
        </Card>
        <Card title="Configura tus objetivos">
          <div className="fields single">
            <Field
              label="Capital inicial ($)"
              value={c.capital}
              onChange={(v) => set("capital", v)}
            />
            <Field
              label="Límite del mejor día (%)"
              value={c.limit}
              onChange={(v) => set("limit", v)}
            />
            <Field
              label="Día válido desde (%)"
              value={c.minPct}
              onChange={(v) => set("minPct", v)}
            />
            <Field
              label="Días requeridos"
              integer
              value={c.required}
              onChange={(v) => set("required", v)}
            />
          </div>
          <p className="caption">
            Configura las reglas de tu firma. Son objetivos personales; no
            verifican elegibilidad para retiros.
          </p>
        </Card>
      </div>
      {edit && (
        <Modal
          title={
            data.days.some((d) => d.id === edit.id)
              ? "Editar día"
              : "Registrar un día"
          }
          onClose={() => setEdit(null)}
        >
          <form onSubmit={submit}>
            <label className="field">
              <span>Fecha</span>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <Field
              label="Resultado neto ($)"
              value={pnl}
              onChange={setPnl}
              placeholder="Ej.: 25 o -12.50"
            />
            <label className="field">
              <span>Nota opcional</span>
              <textarea
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="¿Qué aprendiste hoy?"
              />
            </label>
            {error && <Notice tone="error">{error}</Notice>}
            <Button primary className="full" type="submit">
              Guardar día
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
