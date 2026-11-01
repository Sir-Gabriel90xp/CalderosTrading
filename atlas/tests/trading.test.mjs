import test from "node:test";
import assert from "node:assert/strict";
import { number, grouped } from "../src/lib/numbers.mjs";
import {
  initial,
  cfdSize,
  futureSize,
  consistency,
  recovery,
  validateBackup,
} from "../src/lib/trading.mjs";
test("commas, pasted currency and precision", () => {
  for (const [s, n] of [
    ["25,000", 25000],
    ["1.250,50", 1250.5],
    ["0,5", 0.5],
    ["$1,250.50", 1250.5],
    ["0.005", 0.005],
    ["-1,250.50", -1250.5],
  ])
    assert.equal(number(s), n);
  assert.equal(grouped("11100031201"), "11,100,031,201");
  assert.equal(grouped("25000."), "25,000.");
  assert(Number.isNaN(number("")));
});
test("CFD rounding never exceeds risk, including nondefault steps", () => {
  for (const id of ["gold", "nas", "us30", "btc"])
    for (const budget of [1, 10, 25, 50, 100]) {
      const c = initial().cfd;
      c.market = id;
      c.riskMode = "usd";
      c.risk = String(budget);
      c.distance = "14.012";
      const r = cfdSize(c);
      assert(r.loss <= budget + 1e-8);
      if (r.quantity)
        assert(
          Math.abs(
            (r.quantity - c.spec[id].min) / c.spec[id].step -
              Math.round((r.quantity - c.spec[id].min) / c.spec[id].step),
          ) < 1e-6,
        );
    }
  const c = initial().cfd;
  c.risk = "50";
  c.riskMode = "usd";
  assert.equal(cfdSize(c).quantity, 0.02);
  c.risk = "1";
  c.distance = "100";
  assert.equal(cfdSize(c).quantity, 0);
});
test("futures round stop to tick and include round trip fees", () => {
  const f = initial().futures;
  assert.equal(futureSize(f).quantity, 2);
  f.distance = "20.01";
  assert.equal(futureSize(f).effective, 20.25);
  f.spec.MNQ.fee = 2;
  const r = futureSize(f);
  assert(r.loss <= 100);
  assert.equal(r.profit, r.quantity * (r.effective * 2 * 3 - 2));
  f.risk = "0";
  assert(futureSize(f).error);
});
test("consistency accounts for losses and daily threshold", () => {
  const c = initial().consistency;
  const m = consistency(c, [{ pnl: 30 }, { pnl: 25 }, { pnl: -5 }]);
  assert.equal(m.total, 50);
  assert.equal(m.ratio, 60);
  assert.equal(m.valid, 2);
  assert.equal(m.target, 200);
  assert.equal(m.remaining, 150);
  assert(Number.isNaN(consistency(c, [{ pnl: -1 }]).ratio));
});
test("recovery and total loss", () => {
  assert.equal(Math.round(recovery(5000, 5).percent * 100) / 100, 5.26);
  assert.equal(recovery(5000, 100).percent, Infinity);
  assert.equal(recovery(5000, 101), null);
});
test("backup validation and previous app migration", () => {
  const legacy = { version: 1, consistency: { days: [25, -10] } };
  const migrated = validateBackup(legacy);
  assert.equal(migrated.days.length, 2);
  assert.equal(migrated.days[1].pnl, -10);
  assert.equal(migrated.version, 3);
  const current = initial();
  current.days = [
    { id: crypto.randomUUID(), date: "2026-10-31", pnl: 25, note: "Plan" },
  ];
  assert.deepEqual(validateBackup(current), current);
  assert.throws(() =>
    validateBackup({ ...current, days: [...current.days, ...current.days] }),
  );
  assert.throws(() =>
    validateBackup({ ...current, cfd: { market: "invalid" } }),
  );
  assert.throws(() =>
    validateBackup({
      ...current,
      days: [{ ...current.days[0], date: "2026-02-31" }],
    }),
  );
});
