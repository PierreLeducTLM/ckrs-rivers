import type { FeatureComputeContext } from "./types";
import { findDateIndex, lookback, linearSlope, n } from "./utils";

const TREND_DAYS = 7;

const ALL_NULLS = {
  soil_moisture_0_7cm: null,
  soil_moisture_7_28cm: null,
  soil_moisture_28_100cm: null,
  soil_trend_0_7cm: null,
  soil_trend_7_28cm: null,
  soil_trend_28_100cm: null,
  soil_percentile_0_7cm: null,
} as const;

export function soilFeatures(ctx: FeatureComputeContext) {
  const { weatherBuffer, targetDate } = ctx;
  const idx = findDateIndex(weatherBuffer, targetDate);

  if (idx === -1) {
    return { ...ALL_NULLS };
  }

  // --- Current moisture values ---

  const sm = weatherBuffer[idx].soilMoisture;

  const soil_moisture_0_7cm =
    sm?.depth0to7cm != null ? n(sm.depth0to7cm) : null;
  const soil_moisture_7_28cm =
    sm?.depth7to28cm != null ? n(sm.depth7to28cm) : null;
  const soil_moisture_28_100cm =
    sm?.depth28to100cm != null ? n(sm.depth28to100cm) : null;

  // --- Trends (linear slope over last 7 days) ---

  const window = lookback(weatherBuffer, idx, TREND_DAYS);

  const soil_trend_0_7cm = linearSlope(
    window.map((w) =>
      w.soilMoisture?.depth0to7cm != null ? n(w.soilMoisture.depth0to7cm) : null,
    ),
  );
  const soil_trend_7_28cm = linearSlope(
    window.map((w) =>
      w.soilMoisture?.depth7to28cm != null
        ? n(w.soilMoisture.depth7to28cm)
        : null,
    ),
  );
  const soil_trend_28_100cm = linearSlope(
    window.map((w) =>
      w.soilMoisture?.depth28to100cm != null
        ? n(w.soilMoisture.depth28to100cm)
        : null,
    ),
  );

  // --- Percentile (0–7 cm depth against full historical record) ---

  const soil_percentile_0_7cm = computePercentile(
    soil_moisture_0_7cm,
    ctx.historicalWeatherForPercentiles,
  );

  return {
    soil_moisture_0_7cm,
    soil_moisture_7_28cm,
    soil_moisture_28_100cm,
    soil_trend_0_7cm,
    soil_trend_7_28cm,
    soil_trend_28_100cm,
    soil_percentile_0_7cm,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the percentile rank of `currentValue` within the full historical
 * distribution of 0–7 cm soil moisture values.
 *
 * Uses binary search on the sorted historical values to find the insertion
 * position, then returns `position / total` (0 to 1).
 */
function computePercentile(
  currentValue: number | null,
  historical: FeatureComputeContext["historicalWeatherForPercentiles"],
): number | null {
  if (currentValue === null || !historical || historical.length === 0) {
    return null;
  }

  // Collect all valid 0–7 cm soil moisture values from the historical record
  const values: number[] = [];
  for (const w of historical) {
    if (w.soilMoisture?.depth0to7cm != null) {
      values.push(n(w.soilMoisture.depth0to7cm));
    }
  }

  if (values.length === 0) {
    return null;
  }

  // Sort ascending
  values.sort((a, b) => a - b);

  // Binary search: find the number of values strictly less than currentValue
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < currentValue) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  return lo / values.length;
}
