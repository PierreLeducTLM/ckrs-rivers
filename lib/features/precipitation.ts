import type { FeatureComputeContext } from "./types";
import { findDateIndex, lookback, n } from "./utils";

const ROLLING_WINDOWS = [1, 2, 3, 5, 7, 14] as const;
const SIGNIFICANT_RAIN_MM = 5;
const MAX_DAYS_SINCE = 30;

export function precipitationFeatures(ctx: FeatureComputeContext) {
  const { weatherBuffer, targetDate } = ctx;
  const targetIndex = findDateIndex(weatherBuffer, targetDate);

  if (targetIndex === -1) {
    return {
      precip_sum_1d: null,
      precip_sum_2d: null,
      precip_sum_3d: null,
      precip_sum_5d: null,
      precip_sum_7d: null,
      precip_sum_14d: null,
      precip_days_since_significant: null,
    };
  }

  // Rolling precipitation sums for each window size
  const sums = ROLLING_WINDOWS.map((days) => {
    const window = lookback(weatherBuffer, targetIndex, days);
    return window.reduce((sum, w) => sum + n(w.precipitation), 0);
  });

  // Days since last significant rain event
  let daysSinceSignificant: number | null = null;
  const maxLookback = Math.min(MAX_DAYS_SINCE, targetIndex + 1);

  if (maxLookback < MAX_DAYS_SINCE && targetIndex + 1 < MAX_DAYS_SINCE) {
    // Buffer is too short to determine — we cannot confirm there was no
    // significant rain within the full MAX_DAYS_SINCE window.
    daysSinceSignificant = null;
  } else {
    daysSinceSignificant = null;
    for (let i = 0; i < maxLookback; i++) {
      const w = weatherBuffer[targetIndex - i];
      if (n(w.precipitation) > SIGNIFICANT_RAIN_MM) {
        daysSinceSignificant = i;
        break;
      }
    }
    // If no significant rain found within the window, cap at MAX_DAYS_SINCE
    if (daysSinceSignificant === null) {
      daysSinceSignificant = MAX_DAYS_SINCE;
    }
  }

  return {
    precip_sum_1d: sums[0],
    precip_sum_2d: sums[1],
    precip_sum_3d: sums[2],
    precip_sum_5d: sums[3],
    precip_sum_7d: sums[4],
    precip_sum_14d: sums[5],
    precip_days_since_significant: daysSinceSignificant,
  };
}
