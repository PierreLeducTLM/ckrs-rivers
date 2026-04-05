import type { FeatureComputeContext } from "./types";
import { n } from "./utils";

export function officialForecastFeatures(ctx: FeatureComputeContext) {
  const { forecast, forecastBias } = ctx;

  if (forecast === null) {
    return {
      forecast_low: null,
      forecast_high: null,
      forecast_mid: null,
      forecast_spread: null,
      forecast_horizon: null,
      forecast_bias: forecastBias,
    };
  }

  const low = n(forecast.lowBound);
  const high = n(forecast.highBound);

  return {
    forecast_low: low,
    forecast_high: high,
    forecast_mid: (low + high) / 2,
    forecast_spread: high - low,
    forecast_horizon: n(forecast.horizonDays),
    forecast_bias: forecastBias,
  };
}
