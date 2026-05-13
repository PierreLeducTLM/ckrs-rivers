/**
 * Bras-Louis gauge-level nowcast from Valin (CEHQ 062701) flow.
 *
 * Pure function: no I/O, no DB. The caller fetches Valin's recent
 * series via `lib/realtime/cehq-client.ts` and passes it in.
 */

import type { FlowReading } from "@/lib/domain/flow-reading";

import {
  BRAS_LOUIS_FIT,
  BRAS_LOUIS_REFERENCE_STATION_ID,
  DISPLAY_LEVEL_STEP_M,
  GAUGE_OUTPUT_RANGE_M,
  MAX_REFERENCE_STALENESS_HOURS,
  MIN_SLOPE_SAMPLES,
  SLOPE_WINDOW_HOURS,
  SPRING_JUNE_FLOW_THRESHOLD_M3S,
  VALID_FLOW_RANGE_M3S,
  type Regime,
} from "./bras-louis-calibration";

export type RefusalReason =
  | "no-current-flow"
  | "reference-stale"
  | "flow-out-of-range"
  | "insufficient-slope-samples";

export interface BrasLouisPrediction {
  /** Predicted gauge in metres, clamped to the physical range. */
  gaugeM: number;
  /** Same value rounded to the nearest 0.25 m for display ("1", "1.25", … "4.5"). */
  displayLevelM: number;
  /** ±1σ uncertainty (m) from the active regime's in-sample RMSE. */
  confidenceBandM: number;
  regime: Regime;
  qValinM3s: number;
  slopeM3sPerH: number;
  asOf: Date;
}

export interface BrasLouisRefusal {
  reason: RefusalReason;
  detail: string;
}

export type BrasLouisResult =
  | { ok: true; prediction: BrasLouisPrediction }
  | { ok: false; refusal: BrasLouisRefusal };

interface SeriesPoint {
  t: number; // epoch ms
  q: number; // m³/s
}

function toSeries(readings: FlowReading[]): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (const r of readings) {
    if (r.flow === undefined) continue;
    if (r.stationId !== BRAS_LOUIS_REFERENCE_STATION_ID) continue;
    const t = Date.parse(r.timestamp);
    if (!Number.isFinite(t)) continue;
    points.push({ t, q: r.flow });
  }
  points.sort((a, b) => a.t - b.t);
  return points;
}

/** Least-squares slope of q vs hours, returned in m³/s per hour. */
function slopeM3sPerHour(window: SeriesPoint[], anchorMs: number): number {
  const n = window.length;
  // hours relative to anchor — negative for past points
  const hs: number[] = new Array(n);
  for (let i = 0; i < n; i++) hs[i] = (window[i].t - anchorMs) / 3_600_000;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += hs[i]; sy += window[i].q; }
  const mx = sx / n;
  const my = sy / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const dx = hs[i] - mx;
    num += dx * (window[i].q - my);
    den += dx * dx;
  }
  return den === 0 ? 0 : num / den;
}

function classifyRegime(monthIndex0: number, q: number, slope: number): Regime {
  // monthIndex0: 0–11 from Date.getMonth()
  const month = monthIndex0 + 1;
  if (month === 4 || month === 5) return "spring";
  if (month === 6 && q > SPRING_JUNE_FLOW_THRESHOLD_M3S) return "spring";
  return slope > 0 ? "summer-rising" : "summer-falling";
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function roundTo(x: number, step: number): number {
  return Math.round(x / step) * step;
}

/**
 * Predict the Bras-Louis gauge level for time `at`, using `valinSeries`
 * (any subset of Valin readings — only the trailing window matters).
 *
 * Returns `{ok:false}` with a reason when inputs aren't safe to predict
 * from. Callers should surface the reason rather than fall back to a
 * silently bad number.
 */
export function predictBrasLouisGauge(
  valinSeries: FlowReading[],
  at: Date = new Date(),
): BrasLouisResult {
  const series = toSeries(valinSeries);
  const atMs = at.getTime();

  // Anchor on the latest available reading rather than wall-clock `now`:
  // CEHQ timestamps can be hours off due to local-time-vs-UTC handling,
  // and the slope/level we care about is always relative to whatever
  // data we actually have. The staleness check below catches series
  // that are genuinely too old to predict from.
  const latest = series.length > 0 ? series[series.length - 1] : undefined;
  if (!latest) {
    return {
      ok: false,
      refusal: { reason: "no-current-flow", detail: "No Valin readings in the supplied series." },
    };
  }

  const stalenessHours = (atMs - latest.t) / 3_600_000;
  if (stalenessHours > MAX_REFERENCE_STALENESS_HOURS) {
    return {
      ok: false,
      refusal: {
        reason: "reference-stale",
        detail: `Latest Valin reading is ${stalenessHours.toFixed(1)} h old (cutoff ${MAX_REFERENCE_STALENESS_HOURS} h).`,
      },
    };
  }

  const anchorMs = latest.t;
  const current = latest;

  const q = current.q;
  if (q < VALID_FLOW_RANGE_M3S.min || q > VALID_FLOW_RANGE_M3S.max) {
    return {
      ok: false,
      refusal: {
        reason: "flow-out-of-range",
        detail: `Valin flow ${q.toFixed(1)} m³/s is outside calibrated range ${VALID_FLOW_RANGE_M3S.min}–${VALID_FLOW_RANGE_M3S.max}.`,
      },
    };
  }

  const windowStart = anchorMs - SLOPE_WINDOW_HOURS * 3_600_000;
  const window = series.filter((p) => p.t >= windowStart && p.t <= anchorMs);
  if (window.length < MIN_SLOPE_SAMPLES) {
    return {
      ok: false,
      refusal: {
        reason: "insufficient-slope-samples",
        detail: `Need at least ${MIN_SLOPE_SAMPLES} Valin samples in the ${SLOPE_WINDOW_HOURS} h ending ${new Date(anchorMs).toISOString()}; got ${window.length}.`,
      },
    };
  }

  const slope = slopeM3sPerHour(window, anchorMs);
  const regime = classifyRegime(new Date(anchorMs).getUTCMonth(), q, slope);
  const fit = BRAS_LOUIS_FIT[regime];

  const raw = fit.a + fit.b * q + fit.c * slope;
  const gaugeM = clamp(raw, GAUGE_OUTPUT_RANGE_M.min, GAUGE_OUTPUT_RANGE_M.max);
  const displayLevelM = clamp(
    roundTo(gaugeM, DISPLAY_LEVEL_STEP_M),
    GAUGE_OUTPUT_RANGE_M.min,
    GAUGE_OUTPUT_RANGE_M.max,
  );

  return {
    ok: true,
    prediction: {
      gaugeM,
      displayLevelM,
      confidenceBandM: fit.rmse,
      regime,
      qValinM3s: q,
      slopeM3sPerH: slope,
      asOf: new Date(current.t),
    },
  };
}
