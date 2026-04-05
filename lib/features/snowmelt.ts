import type { FeatureComputeContext } from "./types";
import { findDateIndex, lookback, n } from "./utils";

/**
 * Computes snowmelt-related features for a single target date.
 *
 * - snow_depth: current snow depth in cm
 * - snow_depth_change_Nd: change over N days (negative = melting)
 * - degree_days_above0_Nd: accumulated warmth over N days
 * - melt_potential: combined indicator (snow_depth * degree_days_above0_7d)
 */
export function snowmeltFeatures(ctx: FeatureComputeContext) {
  const { weatherBuffer, targetDate } = ctx;

  const allNull = {
    snow_depth: null as number | null,
    snow_depth_change_1d: null as number | null,
    snow_depth_change_3d: null as number | null,
    snow_depth_change_7d: null as number | null,
    degree_days_above0_1d: null as number | null,
    degree_days_above0_3d: null as number | null,
    degree_days_above0_7d: null as number | null,
    melt_potential: null as number | null,
  };

  // 1. Find targetDate index in weatherBuffer
  const idx = findDateIndex(weatherBuffer, targetDate);
  if (idx === -1) return allNull;

  const today = weatherBuffer[idx];

  // 2. snow_depth — cast branded Centimeters to plain number
  const snow_depth = n(today.snowDepth);

  // 3. snow_depth_change_Nd — negative means melting
  const snowDepthChange = (days: number): number | null => {
    const pastIdx = idx - days;
    if (pastIdx < 0) return null;
    return n(today.snowDepth) - n(weatherBuffer[pastIdx].snowDepth);
  };

  const snow_depth_change_1d = snowDepthChange(1);
  const snow_depth_change_3d = snowDepthChange(3);
  const snow_depth_change_7d = snowDepthChange(7);

  // 4. degree_days_above0_Nd — sum of max(0, mean temp) over last N days
  const degreeDaysAbove0 = (days: number): number | null => {
    const window = lookback(weatherBuffer, idx, days);
    if (window.length === 0) return null;
    return window.reduce(
      (sum, w) => sum + Math.max(0, n(w.temperature.mean)),
      0,
    );
  };

  const degree_days_above0_1d = degreeDaysAbove0(1);
  const degree_days_above0_3d = degreeDaysAbove0(3);
  const degree_days_above0_7d = degreeDaysAbove0(7);

  // 5. melt_potential — snow_depth * degree_days_above0_7d (or null)
  const melt_potential =
    snow_depth !== null && degree_days_above0_7d !== null
      ? snow_depth * degree_days_above0_7d
      : null;

  return {
    snow_depth,
    snow_depth_change_1d,
    snow_depth_change_3d,
    snow_depth_change_7d,
    degree_days_above0_1d,
    degree_days_above0_3d,
    degree_days_above0_7d,
    melt_potential,
  };
}
