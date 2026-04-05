import type { CorrelatedRiver } from "@/lib/domain/correlated-river";
import type { DailyForecast } from "./types";

/**
 * Transforms a flow value using the correlation function.
 */
function transformFlow(
  referenceFlow: number,
  correlation: CorrelatedRiver["correlation"],
): number {
  switch (correlation.type) {
    case "linear":
      return correlation.ratio * referenceFlow + Number(correlation.offset);
    case "offset":
      return referenceFlow + Number(correlation.offset);
    case "power":
      return correlation.coefficient * Math.pow(referenceFlow, correlation.exponent);
  }
}

/**
 * Shifts an ISO date string forward by a given number of days.
 */
function shiftDate(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Estimates flow for an ungauged river by applying a correlation to
 * forecasts from a gauged reference river.
 *
 * For each forecast day the function:
 * 1. Transforms flow, flowLow, and flowHigh through the correlation function.
 * 2. Widens confidence bands to account for correlation uncertainty.
 * 3. Shifts dates by the correlation's time offset.
 * 4. Clamps all flows to a minimum of 0.
 */
export function applyCorrelation(
  referenceForecast: DailyForecast[],
  correlation: CorrelatedRiver,
): DailyForecast[] {
  const dayShift = Math.round(Number(correlation.timeOffsetHours) / 24);
  const confidenceMultiplier = 1 + (1 - Number(correlation.confidence)) * 0.5;

  return referenceForecast.map((forecast) => {
    const correlatedFlow = transformFlow(forecast.flow, correlation.correlation);
    const correlatedFlowLow = transformFlow(forecast.flowLow, correlation.correlation);
    const correlatedFlowHigh = transformFlow(forecast.flowHigh, correlation.correlation);

    // Widen bands based on correlation uncertainty
    const uncertaintyLow = correlatedFlow / confidenceMultiplier;
    const uncertaintyHigh = correlatedFlow * confidenceMultiplier;

    // Keep the original band if it is already wider
    const finalFlowLow = Math.min(correlatedFlowLow, uncertaintyLow);
    const finalFlowHigh = Math.max(correlatedFlowHigh, uncertaintyHigh);

    return {
      ...forecast,
      date: shiftDate(forecast.date, dayShift),
      flow: Math.max(0, correlatedFlow),
      flowLow: Math.max(0, finalFlowLow),
      flowHigh: Math.max(0, finalFlowHigh),
      isCorrelated: true,
    };
  });
}
