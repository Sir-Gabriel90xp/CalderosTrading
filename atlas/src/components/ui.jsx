import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, Check, Layers, X } from "lucide-react";
import { grouped, normalize } from "../lib/numbers.mjs";
export function Badge({ kind = "nas" }) {
  return (
    <span className={`asset-badge ${kind}`} aria-hidden="true">
      {kind === "gold" ? (
        <Layers size={16} />
      ) : kind === "btc" ? (
        "₿"
      ) : kind === "dow" ? (
        "30"
      ) : kind === "sp" ? (
        "500"
      ) : (
        "100"
      )}
    </span>
  );
}
export function Card({ title, children, className = "", action }) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div className="card-heading">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Button({
  children,
  primary = false,
  className = "",
  ...props
}) {
  return (
    <button
      className={`button ${primary ? "primary" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
export function Field({
  label,
  value,
  onChange,
  hint,
  integer = false,
  ...rest
}) {
  const id = useId(),
    ref = useRef(null);
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input
        {...rest}
        ref={ref}
        id={id}
        inputMode={integer ? "numeric" : "decimal"}
        autoComplete="off"
        spellCheck={false}
        value={grouped(value)}
        onChange={(e) => {
          const el = e.target,
            pos = el.selectionStart ?? el.value.length,
            chars = el.value.slice(0, pos).replace(/,/g, "").length;
          let next;
          if (e.nativeEvent.inputType === "insertFromPaste")
            next = normalize(el.value);
          else if (e.nativeEvent.data === ",") {
            const at = Math.max(0, pos - 1);
            next =
              el.value.slice(0, at).replaceAll(",", "") +
              "." +
              el.value.slice(pos).replaceAll(",", "");
          } else next = el.value.replaceAll(",", "");
          onChange(next);
          requestAnimationFrame(() => {
            if (!ref.current) return;
            let i = 0,
              n = 0;
            while (i < ref.current.value.length && n < chars) {
              if (ref.current.value[i] !== ",") n++;
              i++;
            }
            ref.current.setSelectionRange(i, i);
          });
        }}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Select({ label, value, onChange, options }) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o[0]} value={o[0]}>
            {o[1]}
          </option>
        ))}
      </select>
    </label>
  );
}
export function RR({ value, onChange }) {
  const options = [
    "0.5",
    "1",
    "1.5",
    "2",
    "2.5",
    "3",
    "4",
    "5",
    "6",
    "8",
    "10",
  ];
  if (!options.includes(String(value))) options.push(String(value));
  return (
    <Select
      label="Riesgo / beneficio"
      value={value}
      onChange={onChange}
      options={options.map((v) => [v, `1:${v}`])}
    />
  );
}
export function Progress({ value }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label="Progreso"
      aria-valuenow={Math.round(Math.max(0, Math.min(100, value || 0)))}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <i style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
    </div>
  );
}
export function Metric({ label, value, note, tone = "", icon: Icon }) {
  return (
    <div className="metric">
      <div className="metric-label">
        {label}
        {Icon && <Icon size={17} />}
      </div>
      <strong className={tone}>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
export function Help({ children, text }) {
  const [open, setOpen] = useState(false),
    timer = useRef(null),
    id = useId();
  function clear() {
    clearTimeout(timer.current);
    setOpen(false);
  }
  function start() {
    clear();
    timer.current = setTimeout(() => setOpen(true), 1800);
  }
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <span
      className="help-anchor"
      onPointerEnter={(e) => e.pointerType === "mouse" && start()}
      onPointerLeave={clear}
      onFocus={start}
      onBlur={clear}
      onPointerDown={clear}
      onKeyDown={(e) => e.key === "Escape" && clear()}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && (
        <span className="help-tooltip" id={id} role="tooltip">
          {text}
        </span>
      )}
    </span>
  );
}
export function Modal({ title, children, onClose }) {
  const ref = useRef(null),
    id = useId();
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={id}
      onCancel={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <header>
        <h2 id={id}>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Cerrar">
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function LinkButton({ href, children }) {
  return (
    <a
      className="button primary"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <ArrowUpRight size={16} />
    </a>
  );
}
export function Notice({ children, tone = "" }) {
  return (
    <div className={`notice ${tone}`} role="status">
      {children}
    </div>
  );
}
export function Empty({ children }) {
  return (
    <div className="empty">
      <Layers size={27} />
      <p>{children}</p>
    </div>
  );
}
export function SelectedCheck({ active }) {
  return active ? <Check size={14} className="selected-check" /> : null;
}
