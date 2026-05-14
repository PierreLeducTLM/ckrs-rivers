/**
 * Refit Bras-Louis gauge coefficients from the workbook observations.
 *
 *   npx tsx scripts/calibrate-bras-louis.ts [path/to/flowcast_data.json]
 *
 * Defaults to ~/Downloads/flowcast_data.json. Prints:
 *   1. Per-regime OLS fit (the block to paste into bras-louis-calibration.ts)
 *   2. Leave-one-out cross-validation accuracy
 *   3. Largest LOO residuals (so you can sanity-check the fit)
 *   4. A round-trip check feeding the observations back through
 *      `predictBrasLouisGauge` to confirm the shipped predictor agrees.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { FlowReading } from "@/lib/domain/flow-reading";

import {
  BRAS_LOUIS_REFERENCE_STATION_ID,
  SPRING_JUNE_FLOW_THRESHOLD_M3S,
  type Regime,
} from "@/lib/prediction/bras-louis-calibration";
import { predictBrasLouisGauge } from "@/lib/prediction/bras-louis-gauge";

interface RawObservation {
  site: string;
  date: string;
  time: string;
  datetime_iso: string;
  gauge_level_m: number | null;
  reference_flow_m3s: number | null;
  slope_m3s_per_h: number | null;
  note?: string | null;
}

interface Obs {
  q: number;
  slope: number;
  gauge: number;
  date: string;
  iso: string;
  note: string;
}

const inputPath = process.argv[2] ?? join(homedir(), "Downloads", "flowcast_data.json");
const raw = JSON.parse(readFileSync(inputPath, "utf8")) as {
  observations: RawObservation[];
};

const obs: Obs[] = raw.observations
  .filter(
    (o) =>
      o.site === "Bras-Louis" &&
      o.reference_flow_m3s != null &&
      o.slope_m3s_per_h != null &&
      o.gauge_level_m != null,
  )
  .map((o) => ({
    q: o.reference_flow_m3s as number,
    slope: o.slope_m3s_per_h as number,
    gauge: o.gauge_level_m as number,
    date: o.date,
    iso: o.datetime_iso,
    note: (o.note ?? "").slice(0, 50),
  }));

function classifyRegime(o: Obs): Regime {
  const month = Number(o.date.slice(5, 7));
  if (month === 4 || month === 5) return "spring";
  if (month === 6 && o.q > SPRING_JUNE_FLOW_THRESHOLD_M3S) return "spring";
  return o.slope > 0 ? "summer-rising" : "summer-falling";
}

/** Ordinary least squares for design matrix [1, q, slope]. */
function fitOls(rows: Obs[]): { a: number; b: number; c: number } {
  const X: number[][] = rows.map((r) => [1, r.q, r.slope]);
  const y = rows.map((r) => r.gauge);
  const XtX = Array.from({ length: 3 }, (_, i) =>
    Array.from({ length: 3 }, (_, j) =>
      X.reduce((s, row) => s + row[i] * row[j], 0),
    ),
  );
  const Xty = [0, 1, 2].map((i) => X.reduce((s, row, k) => s + row[i] * y[k], 0));
  const det3 = (m: number[][]): number =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det3(XtX);
  const coef = (col: number): number => {
    const M = XtX.map((row) => row.slice());
    for (let r = 0; r < 3; r++) M[r][col] = Xty[r];
    return det3(M) / D;
  };
  return { a: coef(0), b: coef(1), c: coef(2) };
}

function rmse(errs: number[]): number {
  return Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length);
}

function r2(rows: Obs[], pred: number[]): number {
  const my = rows.reduce((s, r) => s + r.gauge, 0) / rows.length;
  const ssRes = rows.reduce((s, r, i) => s + (r.gauge - pred[i]) ** 2, 0);
  const ssTot = rows.reduce((s, r) => s + (r.gauge - my) ** 2, 0) || 1e-9;
  return 1 - ssRes / ssTot;
}

// 1. Per-regime fits
const regimes: Regime[] = ["spring", "summer-rising", "summer-falling"];
const byRegime = new Map<Regime, Obs[]>(regimes.map((r) => [r, []]));
for (const o of obs) byRegime.get(classifyRegime(o))!.push(o);

console.log(`\nBras-Louis observations: ${obs.length} (after filtering nulls)`);
console.log("\nPer-regime OLS fit (gauge = a + b·Q + c·dQ/dt):");
const fits = new Map<Regime, { a: number; b: number; c: number; rmse: number; r2: number; n: number }>();
for (const r of regimes) {
  const rows = byRegime.get(r)!;
  const { a, b, c } = fitOls(rows);
  const pred = rows.map((row) => a + b * row.q + c * row.slope);
  const errs = rows.map((row, i) => row.gauge - pred[i]);
  const fit = { a, b, c, rmse: rmse(errs), r2: r2(rows, pred), n: rows.length };
  fits.set(r, fit);
  console.log(
    `  ${r.padEnd(16)} n=${String(fit.n).padStart(2)}  a=${fit.a.toFixed(4).padStart(7)}  b=${fit.b.toFixed(5)}  c=${fit.c.toFixed(4).padStart(7)}  R²=${fit.r2.toFixed(3)}  RMSE=${fit.rmse.toFixed(3)}m`,
  );
}

// 2. LOO-CV
const looErrs: { err: number; o: Obs; pred: number; regime: Regime }[] = [];
for (let i = 0; i < obs.length; i++) {
  const o = obs[i];
  const regime = classifyRegime(o);
  const train = obs.filter((_, j) => j !== i && classifyRegime(obs[j]) === regime);
  if (train.length < 4) continue;
  const { a, b, c } = fitOls(train);
  const pred = a + b * o.q + c * o.slope;
  looErrs.push({ err: pred - o.gauge, o, pred, regime });
}
const looErrVals = looErrs.map((e) => e.err);
const within = (thr: number) =>
  (looErrs.filter((e) => Math.abs(e.err) <= thr).length / looErrs.length) * 100;
console.log("\nLeave-one-out CV:");
console.log(
  `  n=${looErrs.length}  RMSE=${rmse(looErrVals).toFixed(3)}m  MAE=${(looErrVals.reduce((s, e) => s + Math.abs(e), 0) / looErrs.length).toFixed(3)}m`,
);
console.log(
  `  within ±0.25m: ${within(0.25).toFixed(0)}%   ±0.5m: ${within(0.5).toFixed(0)}%   ±0.75m: ${within(0.75).toFixed(0)}%`,
);

looErrs.sort((a, b) => Math.abs(b.err) - Math.abs(a.err));
console.log("\nLargest LOO residuals:");
for (const e of looErrs.slice(0, 5)) {
  console.log(
    `  actual=${e.o.gauge.toFixed(2)}  pred=${e.pred.toFixed(2)}  err=${e.err >= 0 ? "+" : ""}${e.err.toFixed(2)}  Q=${e.o.q.toFixed(1)}  slope=${e.o.slope >= 0 ? "+" : ""}${e.o.slope.toFixed(2)}  ${e.regime}  ${e.o.date}`,
  );
}

// 3. Coefficient block ready to paste
console.log("\nCoefficient block (paste into bras-louis-calibration.ts):");
const block: Record<string, unknown> = {};
for (const [r, f] of fits.entries()) {
  block[r] = {
    a: Number(f.a.toFixed(6)),
    b: Number(f.b.toFixed(6)),
    c: Number(f.c.toFixed(6)),
    rmse: Number(f.rmse.toFixed(3)),
    r2: Number(f.r2.toFixed(3)),
    n: f.n,
  };
}
console.log(JSON.stringify(block, null, 2));

// 4. Round-trip check: feed each observation back through the shipped
//    predictor by synthesising a Valin series that produces the same
//    (Q, slope) at the observation time. We use 4 points 1 h apart with
//    Q linearly varying so the LSQ slope equals the recorded slope, and
//    Q at the observation time equals the recorded Q.
console.log("\nShipped predictor round-trip (in-sample residuals):");
let shipErrSum = 0;
let shipErrSqSum = 0;
let shipN = 0;
const worstShip: { err: number; o: Obs; pred: number }[] = [];
for (const o of obs) {
  if (o.q < 12 || o.q > 220) continue;
  const at = new Date(o.iso);
  const series: FlowReading[] = [];
  for (let h = 3; h >= 0; h--) {
    const ts = new Date(at.getTime() - h * 3_600_000);
    series.push({
      stationId: BRAS_LOUIS_REFERENCE_STATION_ID,
      timestamp: ts.toISOString(),
      flow: (o.q - h * o.slope) as FlowReading["flow"],
      source: "gauge",
      quality: "provisional",
    });
  }
  const res = predictBrasLouisGauge(series, at);
  if (!res.ok) continue;
  const err = res.prediction.gaugeM - o.gauge;
  shipErrSum += Math.abs(err);
  shipErrSqSum += err * err;
  shipN++;
  worstShip.push({ err, o, pred: res.prediction.gaugeM });
}
console.log(
  `  n=${shipN}  RMSE=${Math.sqrt(shipErrSqSum / shipN).toFixed(3)}m  MAE=${(shipErrSum / shipN).toFixed(3)}m`,
);
worstShip.sort((a, b) => Math.abs(b.err) - Math.abs(a.err));
console.log("  Worst residuals via shipped predictor:");
for (const w of worstShip.slice(0, 3)) {
  console.log(
    `    actual=${w.o.gauge.toFixed(2)}  pred=${w.pred.toFixed(2)}  err=${w.err >= 0 ? "+" : ""}${w.err.toFixed(2)}  Q=${w.o.q.toFixed(1)}  slope=${w.o.slope >= 0 ? "+" : ""}${w.o.slope.toFixed(2)}  ${w.o.date}`,
  );
}
