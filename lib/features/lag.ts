import type { FeatureComputeContext } from "./types";
import { subtractDays } from "./utils";

/**
 * Computes autoregressive lag features from historical flow readings.
 *
 * Reads from `ctx.flowByDate` (a Map<string, number> keyed by ISO date).
 * The module does NOT distinguish training/prediction mode -- the caller
 * populates the map accordingly.
 */
export function lagFeatures(ctx: FeatureComputeContext): {
  flow_prev_1d: number | null;
  flow_trend_1d: number | null;
  flow_trend_3d: number | null;
  flow_trend_7d: number | null;
} {
  const { targetDate, flowByDate } = ctx;

  const d1 = flowByDate.get(subtractDays(targetDate, 1)) ?? null;
  const d2 = flowByDate.get(subtractDays(targetDate, 2)) ?? null;
  const d4 = flowByDate.get(subtractDays(targetDate, 4)) ?? null;
  const d8 = flowByDate.get(subtractDays(targetDate, 8)) ?? null;

  return {
    flow_prev_1d: d1,
    flow_trend_1d: d1 !== null && d2 !== null ? d1 - d2 : null,
    flow_trend_3d: d1 !== null && d4 !== null ? d1 - d4 : null,
    flow_trend_7d: d1 !== null && d8 !== null ? d1 - d8 : null,
  };
}
