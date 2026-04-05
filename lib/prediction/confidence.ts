import type { ConfidenceLevel } from "./types";

/**
 * Compute heuristic confidence bands around a point-estimate prediction.
 *
 * Because our gradient-boosting model produces point estimates (no quantile
 * regression), we approximate uncertainty as a percentage of the predicted
 * flow that widens with the forecast horizon:
 *
 *   base uncertainty = 15 %
 *   scaled uncertainty = base * (1 + 0.15 * (horizon - 1))
 *
 *   Day+1  -> +/-15.0 %
 *   Day+3  -> +/-19.5 %  (0.15 * 1.3)
 *   Day+7  -> +/-28.5 %  (0.15 * 1.9)
 */
export function computeConfidenceBands(
  predictedFlow: number,
  horizon: number,
): { low: number; high: number } {
  const baseUncertainty = 0.15;
  const uncertainty = baseUncertainty * (1 + 0.15 * (horizon - 1));

  const low = Math.max(0, predictedFlow * (1 - uncertainty));
  const high = predictedFlow * (1 + uncertainty);

  return { low, high };
}

/**
 * Map a forecast horizon (in days) to a qualitative confidence level.
 *
 *   1-2 days  -> "high"
 *   3-5 days  -> "medium"
 *   6+  days  -> "low"
 */
export function getConfidenceLevel(horizon: number): ConfidenceLevel {
  if (horizon <= 2) return "high";
  if (horizon <= 5) return "medium";
  return "low";
}
