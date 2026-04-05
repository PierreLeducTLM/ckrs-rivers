import type { PaddlingThreshold } from "@/lib/domain/paddling-threshold";
import type { ThresholdStatus } from "./types";

/**
 * Classify a predicted flow value against paddling thresholds.
 *
 * Uses the `max` of each range as the upper boundary for that status level.
 * The ranges are assumed to be monotonically ordered per the
 * {@link PaddlingThreshold} validation.
 *
 * @param flow - Predicted flow in m³/s.
 * @param thresholds - Paddling thresholds for the station/skill, or undefined.
 * @returns The threshold status for the given flow.
 */
export function classifyFlow(
  flow: number,
  thresholds: PaddlingThreshold | undefined,
): ThresholdStatus {
  if (thresholds === undefined) return "unknown";

  if (flow < Number(thresholds.tooLow.max)) return "too_low";
  if (flow < Number(thresholds.lowRunnable.max)) return "low_runnable";
  if (flow < Number(thresholds.optimal.max)) return "optimal";
  if (flow < Number(thresholds.highRunnable.max)) return "high_runnable";

  return "too_high";
}
