import type { FeatureComputeContext } from "./types";
import { dayOfYear } from "./utils";

const TWO_PI_OVER_YEAR = (2 * Math.PI) / 365.25;
const SPRING_MONTHS = new Set([3, 4, 5]);

export function seasonalFeatures(ctx: FeatureComputeContext) {
  const date = new Date(ctx.targetDate + "T00:00:00Z");
  const doy = dayOfYear(ctx.targetDate);
  const month = date.getUTCMonth() + 1; // 1-12

  const angle = TWO_PI_OVER_YEAR * doy;

  return {
    day_sin: Math.sin(angle),
    day_cos: Math.cos(angle),
    month,
    is_spring_melt: SPRING_MONTHS.has(month) ? 1 : 0,
  };
}
