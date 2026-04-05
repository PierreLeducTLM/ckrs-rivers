import type { FeatureRow } from "@/lib/features/types";
import type { FlowReading } from "@/lib/domain/flow-reading";
import {
  FEATURE_COLUMNS,
  PREDICTION_HORIZON_INDEX,
  NUM_FEATURES,
  type TrainingSample,
} from "./types";

// ---------------------------------------------------------------------------
// Build a training dataset from feature rows and observed flow readings
// ---------------------------------------------------------------------------

/**
 * Converts parallel arrays of feature rows and flow readings into training
 * samples suitable for gradient-boosted tree training.
 *
 * Each sample pairs a dense feature vector (Float64Array) with a log-flow
 * target. Rows without a matching positive flow reading are silently dropped.
 *
 * @param featureRows  - Pre-computed feature rows (one per station per day).
 * @param flowReadings - Raw gauge readings (potentially many per day).
 * @param predictionHorizon - Forecast horizon injected as an extra feature
 *                            column (default 0 = nowcast).
 * @returns Training samples ready for the model.
 */
export function buildTrainingDataset(
  featureRows: FeatureRow[],
  flowReadings: FlowReading[],
  predictionHorizon: number = 0,
): TrainingSample[] {
  // -----------------------------------------------------------------------
  // 1. Build lookup: stationId -> date -> average daily flow
  // -----------------------------------------------------------------------
  const flowLookup = buildFlowLookup(flowReadings);

  // -----------------------------------------------------------------------
  // 2. Map each feature row to a training sample (skip when no target)
  // -----------------------------------------------------------------------
  const samples: TrainingSample[] = [];

  for (const row of featureRows) {
    const stationFlows = flowLookup.get(row._stationId);
    if (!stationFlows) continue;

    const flow = stationFlows.get(row._date);
    if (flow === undefined) continue;

    // Skip non-positive flow: log is undefined for flow <= 0
    if (flow <= 0) continue;

    const target = Math.log(flow);

    // Build the dense feature vector
    const features = new Float64Array(NUM_FEATURES);

    for (let i = 0; i < FEATURE_COLUMNS.length; i++) {
      const key = FEATURE_COLUMNS[i];
      const value = row[key];
      features[i] = value === null ? NaN : Number(value);
    }

    features[PREDICTION_HORIZON_INDEX] = predictionHorizon;

    samples.push({
      features,
      target,
      metadata: { stationId: row._stationId, date: row._date },
    });
  }

  return samples;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Aggregates flow readings into a two-level map:
 *   stationId -> date (YYYY-MM-DD) -> average daily flow (m^3/s)
 *
 * Readings with an undefined `flow` field are ignored.
 */
function buildFlowLookup(
  readings: FlowReading[],
): Map<string, Map<string, number>> {
  // Accumulate sum and count per station+date for averaging
  const accum = new Map<
    string,
    Map<string, { sum: number; count: number }>
  >();

  for (const r of readings) {
    if (r.flow === undefined) continue;

    const stationId = r.stationId;
    const date = r.timestamp.slice(0, 10);
    const flowValue = Number(r.flow);

    if (!Number.isFinite(flowValue)) continue;

    let stationMap = accum.get(stationId);
    if (!stationMap) {
      stationMap = new Map();
      accum.set(stationId, stationMap);
    }

    const entry = stationMap.get(date);
    if (entry) {
      entry.sum += flowValue;
      entry.count += 1;
    } else {
      stationMap.set(date, { sum: flowValue, count: 1 });
    }
  }

  // Collapse to averages
  const lookup = new Map<string, Map<string, number>>();

  for (const [stationId, dateMap] of accum) {
    const averaged = new Map<string, number>();
    for (const [date, { sum, count }] of dateMap) {
      averaged.set(date, sum / count);
    }
    lookup.set(stationId, averaged);
  }

  return lookup;
}
