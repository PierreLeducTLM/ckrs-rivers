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

export function computePredictorOverlay(
  predictorKey: string,
  readings: FlowReading[],
): PredictorOverlay | null {
  const predictor = getPredictor(predictorKey);
  if (!predictor) return null;

  const sorted = readings
    .filter((r) => r.flow != null && Number.isFinite(Date.parse(r.timestamp)))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  if (sorted.length === 0) return null;

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
