import type { FeatureComputeContext } from "./types";
import { findDateIndex, n } from "./utils";

const MAX_SNOWFALL_LOOKBACK = 90;

export function temperatureFeatures(ctx: FeatureComputeContext) {
  const { weatherBuffer, targetDate } = ctx;
  const idx = findDateIndex(weatherBuffer, targetDate);

  if (idx === -1) {
    return {
      temp_mean: null,
      temp_freeze_thaw: null,
      temp_diurnal_range: null,
      temp_degree_days_since_snowfall: null,
    };
  }

  const w = weatherBuffer[idx];

  const tempMean = n(w.temperature.mean);
  const tempMin = n(w.temperature.min);
  const tempMax = n(w.temperature.max);

  // Freeze-thaw: 1 if temperature crosses 0 during the day
  const freezeThaw = tempMin < 0 && tempMax > 0 ? 1 : 0;

  // Diurnal range: difference between daily max and min
  const diurnalRange = tempMax - tempMin;

  // Accumulated degree-days (above 0) since last snowfall event.
  // Walk backward from targetIndex, summing max(0, mean_temp) each day,
  // until a day with snowfall > 0 is found. Cap lookback at 90 days.
  // Return null if the buffer is exhausted without finding snowfall.
  let degreeDaysSinceSnowfall: number | null = null;
  const maxLookback = Math.min(MAX_SNOWFALL_LOOKBACK, idx + 1);

  for (let i = 0; i < maxLookback; i++) {
    const day = weatherBuffer[idx - i];
    if (n(day.snowfall) > 0) {
      // Found snowfall — accumulate degree-days from the day after snowfall
      // up to (and including) targetDate.
      let accum = 0;
      for (let j = i - 1; j >= 0; j--) {
        accum += Math.max(0, n(weatherBuffer[idx - j].temperature.mean));
      }
      degreeDaysSinceSnowfall = accum;
      break;
    }
  }

  return {
    temp_mean: tempMean,
    temp_freeze_thaw: freezeThaw,
    temp_diurnal_range: diurnalRange,
    temp_degree_days_since_snowfall: degreeDaysSinceSnowfall,
  };
}
