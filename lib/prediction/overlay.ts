/**
 * Compute a moving-nowcast overlay for a predictor over a series of
 * reference-station readings, so the predicted value can be drawn on the
 * detail-page chart alongside observed flow.
 *
 * For each reading (chronological), the predictor runs anchored at that
 * timestamp using only the readings available up to that point — mirroring
 * what the predictor would have produced live. Works for both the recent
 * cache window and backfilled hourly history.
 */

import type { FlowReading } from "@/lib/domain/flow-reading";
import { getPredictor } from "@/lib/prediction/registry";

export interface PredictorOverlay {
  unit: string;
  label: string;
  /** Predicted value keyed by timestamp epoch (ms). */
  byTs: Map<number, number>;
}

// Only the trailing window matters to the predictor (slope window ≤ a few
// hours). Feeding a small tail keeps this O(n) over long histories instead
// of O(n²).
const LOOKBACK_POINTS = 12;
const HOUR_MS = 60 * 60 * 1000;

export interface OverlayOptions {
  /**
   * Linearly interpolate the series to hourly before predicting. Use for
   * daily-resolution history: the predictor's slope window needs several
   * sub-daily samples, and interpolation yields a slope equal to the daily
   * trend (per hour) without touching the calibrated model. No-op on data
   * that is already hourly.
   */
  densify?: boolean;
}

/** Fill gaps between consecutive readings with hourly interpolated points. */
function densifyToHourly(sorted: FlowReading[]): FlowReading[] {
  if (sorted.length < 2) return sorted;
  const out: FlowReading[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    out.push(a);
    const ta = Date.parse(a.timestamp);
    const tb = Date.parse(b.timestamp);
    const gapHours = (tb - ta) / HOUR_MS;
    // Interpolate only across daily-ish gaps; skip tiny gaps and huge holes.
    if (gapHours > 1.5 && gapHours <= 24 * 45) {
      const fa = a.flow as number;
      const fb = b.flow as number;
      for (let h = 1; h < gapHours; h++) {
        const t = ta + h * HOUR_MS;
        if (t >= tb) break;
        const frac = (t - ta) / (tb - ta);
        out.push({
          ...a,
          timestamp: new Date(t).toISOString(),
          flow: (fa + (fb - fa) * frac) as FlowReading["flow"],
        });
      }
    }
  }
  out.push(sorted[sorted.length - 1]);
  return out;
}

export function computePredictorOverlay(
  predictorKey: string,
  readings: FlowReading[],
  options: OverlayOptions = {},
): PredictorOverlay | null {
  const predictor = getPredictor(predictorKey);
  if (!predictor) return null;

  let sorted = readings
    .filter((r) => r.flow != null && Number.isFinite(Date.parse(r.timestamp)))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  if (sorted.length === 0) return null;
  if (options.densify) sorted = densifyToHourly(sorted);

  const byTs = new Map<number, number>();
  for (let i = 0; i < sorted.length; i++) {
    const ts = Date.parse(sorted[i].timestamp);
    const tail = sorted.slice(Math.max(0, i - LOOKBACK_POINTS + 1), i + 1);
    const res = predictor.predict(tail, new Date(ts));
    if (res.ok) byTs.set(ts, res.output.value);
  }
  if (byTs.size === 0) return null;

  return { unit: predictor.unit, label: predictor.label, byTs };
}
