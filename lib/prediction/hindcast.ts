/**
 * Hindcast engine — generates model predictions for historical dates.
 *
 * For each target date D in the range, computes features using:
 *   - Historical weather data through D
 *   - Actual flow readings up to D-1 (lag features)
 * Then runs the model with horizon=1 to produce what we "would have predicted."
 *
 * Comparing hindcast predictions against observed values measures
 * real-world model accuracy without information leakage.
 */

import type { RiverStation } from "@/lib/domain/river-station";
import type { TrainedModel } from "@/lib/model/types";
import type { FeatureComputeContext, FeatureRow } from "@/lib/features/types";
import { computeFeatureRow } from "@/lib/features/compute";
import {
  FEATURE_COLUMNS,
  PREDICTION_HORIZON_INDEX,
  NUM_FEATURES,
} from "@/lib/model/types";
import { hydrateModel } from "@/lib/model/serialize";
import { predictFlow } from "@/lib/model/gradient-boost";
import { computeConfidenceBands } from "./confidence";
import { getWeatherTimeline } from "@/lib/weather/weather-service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HindcastPoint {
  date: string;
  predicted: number;
  predictedLow: number;
  predictedHigh: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function featureRowToVector(row: FeatureRow, horizon: number): Float64Array {
  const vec = new Float64Array(NUM_FEATURES);

  for (let i = 0; i < FEATURE_COLUMNS.length; i++) {
    const key = FEATURE_COLUMNS[i];
    const value = row[key];
    vec[i] = value === null || value === undefined ? NaN : Number(value);
  }

  vec[PREDICTION_HORIZON_INDEX] = horizon;
  return vec;
}

// ---------------------------------------------------------------------------
// Main hindcast engine
// ---------------------------------------------------------------------------

/**
 * Generate hindcast predictions for a historical date range.
 *
 * Uses actual weather + actual flow (for lag features) to simulate
 * what the model would have predicted for each day.
 */
export async function generateHindcast(params: {
  station: RiverStation;
  model: TrainedModel;
  startDate: string;
  endDate: string;
  flowReadings: { date: string; flow: number }[];
}): Promise<HindcastPoint[]> {
  const { station, model, startDate, endDate, flowReadings } = params;

  // Hydrate model once
  const predictor = hydrateModel(model);

  // Fetch weather using the timeline API: archive for older dates +
  // forecast endpoint for recent days (the archive lags ~5 days).
  const weatherStart = addDays(startDate, -14);
  const today = new Date().toISOString().slice(0, 10);
  const clampedEnd = endDate <= today ? endDate : today;

  // getWeatherTimeline merges archive (up to yesterday) + forecast (today+)
  // so the recent ~5-day gap in the archive is covered by forecast data.
  const weather = await getWeatherTimeline(station, weatherStart);

  // Build flow lookup from all available readings
  const flowByDate = new Map<string, number>();
  for (const r of flowReadings) {
    flowByDate.set(r.date, r.flow);
  }

  // Generate predictions for each date in range
  const results: HindcastPoint[] = [];
  const current = new Date(startDate + "T00:00:00Z");
  const last = new Date(clampedEnd + "T00:00:00Z");

  while (current <= last) {
    const date = current.toISOString().slice(0, 10);

    const ctx: FeatureComputeContext = {
      targetDate: date,
      station,
      weatherBuffer: weather,
      flowByDate,
      forecast: null,
      forecastBias: null,
      historicalWeatherForPercentiles: null,
      mode: "prediction",
    };

    const row: FeatureRow = computeFeatureRow(ctx);
    const features = featureRowToVector(row, 1);
    const predicted = predictFlow(predictor, features);
    const { low, high } = computeConfidenceBands(predicted, 1);

    results.push({
      date,
      predicted,
      predictedLow: low,
      predictedHigh: high,
    });

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return results;
}
