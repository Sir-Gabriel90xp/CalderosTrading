export function normalize(value) {
  let v = String(value ?? "")
    .trim()
    .replace(/[\s$€%]/g, "")
    .replace(/−/g, "-");
  if (v.includes(",") && v.includes("."))
    v =
      v.lastIndexOf(",") > v.lastIndexOf(".")
        ? v.replace(/\./g, "").replace(",", ".")
        : v.replace(/,/g, "");
  else if (v.includes(","))
    v = /^-?[1-9]\d{0,2}(,\d{3})+$/.test(v)
      ? v.replace(/,/g, "")
      : v.replace(",", ".");
  return v;
}
export const number = (v) => {
  const s = normalize(v);
  return s !== "" && /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s) ? Number(s) : NaN;
};
export function grouped(v) {
  const s = normalize(v);
  if (!/^-?\d*(\.\d*)?$/.test(s)) return String(v ?? "");
  const [i, d] = s.split(".");
  return (
    i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (d !== undefined ? "." + d : "")
  );
}
export const fmt = (v, d = 2) =>
  Number.isFinite(v)
    ? v.toLocaleString("en-US", { maximumFractionDigits: d })
    : "—";
export const usd = (v) =>
  Number.isFinite(v)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(v)
    : "—";
export const positive = (...values) =>
  values.every((v) => Number.isFinite(v) && v > 0);
