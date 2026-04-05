import type { FeatureRow, FeatureComputeContext } from "@/lib/features/types";
import type {
  PredictionInput,
  ForecastResult,
  DailyForecast,
} from "./types";
import type { OfficialForecast } from "@/lib/domain/official-forecast";
import { getWeatherTimeline } from "@/lib/weather/weather-service";
import { computeFeatureRow } from "@/lib/features/compute";
import {
  FEATURE_COLUMNS,
  PREDICTION_HORIZON_INDEX,
  NUM_FEATURES,
} from "@/lib/model/types";
import { hydrateModel } from "@/lib/model/serialize";
import { predictFlow, type GBMPredictor } from "@/lib/model/gradient-boost";
import { computeConfidenceBands, getConfidenceLevel } from "./confidence";
import { classifyFlow } from "./threshold";
import { applyCorrelation } from "./correlated";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Adds a number of days to an ISO date string and returns the resulting
 * ISO date (YYYY-MM-DD).
 */
function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Converts a FeatureRow into the Float64Array expected by the GBM predictor.
 *
 * The vector follows the FEATURE_COLUMNS ordering with an appended
 * `prediction_horizon` slot.  Null feature values are mapped to NaN so the
 * tree can route them via default-direction splits.
 */
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
// Main forecast engine
// ---------------------------------------------------------------------------

/**
 * Generate a multi-day flow forecast using cascading one-day-at-a-time
 * predictions.
 *
 * Each day's predicted flow is injected back into the feature context so that
 * subsequent days can use it for lag features, giving the model a realistic
 * view of recent flow even beyond the observed data window.
 */
export async function generateForecast(
  input: PredictionInput,
): Promise<ForecastResult> {
  const forecastDays = input.forecastDays ?? 7;
  const today = new Date().toISOString().slice(0, 10);
  const historicalStart = addDays(today, -14);

  // 1. Hydrate model into live tree structures
  const predictor: GBMPredictor = hydrateModel(input.model);

  // 2. Fetch weather timeline (historical lookback + forecast window)
  const weatherTimeline = await getWeatherTimeline(
    input.station,
    historicalStart,
    forecastDays,
  );

  // 3. Build flow lookup from recent observed readings (average per day)
  const flowByDate = new Map<string, number>();
  if (input.recentFlowReadings) {
    const sums = new Map<string, { total: number; count: number }>();
    for (const reading of input.recentFlowReadings) {
      if (reading.flow === undefined) continue;
      const date = reading.timestamp.slice(0, 10);
      const entry = sums.get(date) ?? { total: 0, count: 0 };
      entry.total += Number(reading.flow);
      entry.count += 1;
      sums.set(date, entry);
    }
    for (const [date, { total, count }] of sums) {
      flowByDate.set(date, total / count);
    }
  }

  // 4. Build forecast lookup — keep the forecast with smallest horizonDays
  //    per target date.
  const forecastByDate = new Map<string, OfficialForecast>();
  if (input.officialForecasts) {
    for (const f of input.officialForecasts) {
      const existing = forecastByDate.get(f.targetDate);
      if (
        !existing ||
        (f.horizonDays as number) < (existing.horizonDays as number)
      ) {
        forecastByDate.set(f.targetDate, f);
      }
    }
  }

  // 5. Cascading prediction loop — one day at a time so each day's
  //    predicted flow feeds into subsequent lag features.
  const forecasts: DailyForecast[] = [];

  for (let horizon = 1; horizon <= forecastDays; horizon++) {
    const targetDate = addDays(today, horizon);

    // a. Build the feature compute context for this single day
    const ctx: FeatureComputeContext = {
      targetDate,
      station: input.station,
      weatherBuffer: weatherTimeline,
      flowByDate,
      forecast: forecastByDate.get(targetDate) ?? null,
      forecastBias: input.forecastBias ?? null,
      historicalWeatherForPercentiles: null, // skip percentiles at prediction time
      mode: "prediction",
    };

    // b. Compute the feature row for the target date
    const row: FeatureRow = computeFeatureRow(ctx);

    // c. Convert to the numeric vector the model expects
    const features = featureRowToVector(row, horizon);

    // d. Predict flow (real-space, m^3/s)
    const predictedFlow = predictFlow(predictor, features);

    // e. Inject the prediction into flowByDate for cascading lag features
    flowByDate.set(targetDate, predictedFlow);

    // f. Compute confidence bands and threshold classification
    const { low, high } = computeConfidenceBands(predictedFlow, horizon);
    const confidence = getConfidenceLevel(horizon);
    const thresholdStatus = classifyFlow(predictedFlow, input.thresholds);

    // g. Build daily forecast entry
    forecasts.push({
      date: targetDate,
      flow: predictedFlow,
      flowLow: low,
      flowHigh: high,
      horizon,
      confidence,
      thresholdStatus,
      isCorrelated: false,
    });
  }

  // 6. Apply correlation transform for ungauged rivers
  const finalForecasts = input.correlation
    ? applyCorrelation(forecasts, input.correlation)
    : forecasts;

  // 7. If correlation was applied, re-classify thresholds on the
  //    transformed flows (the original classification used reference
  //    station thresholds).
  const classifiedForecasts = input.correlation
    ? finalForecasts.map((f) => ({
        ...f,
        thresholdStatus: classifyFlow(f.flow, input.thresholds),
      }))
    : finalForecasts;

  // 8. Find next optimal window — longest consecutive run of "optimal" days
  const nextOptimalWindow = findOptimalWindow(classifiedForecasts);

  return {
    stationId: input.station.id,
    stationName: input.station.name,
    generatedAt: new Date().toISOString(),
    forecasts: classifiedForecasts,
    nextOptimalWindow,
  };
}

// ---------------------------------------------------------------------------
// Optimal window detection
// ---------------------------------------------------------------------------

/**
 * Scans the forecast array for the first consecutive run of days where the
 * threshold status is "optimal".  Returns the start and end dates of that
 * window, or null if no optimal days exist.
 */
function findOptimalWindow(
  forecasts: DailyForecast[],
): { startDate: string; endDate: string } | null {
  let bestStart: string | null = null;
  let bestEnd: string | null = null;
  let bestLength = 0;

  let currentStart: string | null = null;
  let currentLength = 0;

  for (const f of forecasts) {
    if (f.thresholdStatus === "optimal") {
      if (currentStart === null) {
        currentStart = f.date;
      }
      currentLength++;
      if (currentLength > bestLength) {
        bestLength = currentLength;
        bestStart = currentStart;
        bestEnd = f.date;
      }
    } else {
      currentStart = null;
      currentLength = 0;
    }
  }

  if (bestStart !== null && bestEnd !== null) {
    return { startDate: bestStart, endDate: bestEnd };
  }

  return null;
}
