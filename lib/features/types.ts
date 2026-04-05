import type { WeatherWindow } from "@/lib/domain/weather-window";
import type { RiverStation } from "@/lib/domain/river-station";
import type { OfficialForecast } from "@/lib/domain/official-forecast";

// ---------------------------------------------------------------------------
// Feature Row — one per station per day (46 numeric columns)
// ---------------------------------------------------------------------------

export type FeatureRow = {
  // Metadata (not fed to model)
  readonly _stationId: string;
  readonly _date: string;

  // 1. Precipitation accumulation (7)
  precip_sum_1d: number | null;
  precip_sum_2d: number | null;
  precip_sum_3d: number | null;
  precip_sum_5d: number | null;
  precip_sum_7d: number | null;
  precip_sum_14d: number | null;
  precip_days_since_significant: number | null;

  // 2. Snowmelt (8)
  snow_depth: number | null;
  snow_depth_change_1d: number | null;
  snow_depth_change_3d: number | null;
  snow_depth_change_7d: number | null;
  degree_days_above0_1d: number | null;
  degree_days_above0_3d: number | null;
  degree_days_above0_7d: number | null;
  melt_potential: number | null;

  // 3. Soil saturation (7)
  soil_moisture_0_7cm: number | null;
  soil_moisture_7_28cm: number | null;
  soil_moisture_28_100cm: number | null;
  soil_trend_0_7cm: number | null;
  soil_trend_7_28cm: number | null;
  soil_trend_28_100cm: number | null;
  soil_percentile_0_7cm: number | null;

  // 4. Temperature (5)
  temp_mean: number | null;
  temp_freeze_thaw: number | null;
  temp_diurnal_range: number | null;
  temp_degree_days_since_snowfall: number | null;

  // 5. Seasonal/calendar (4)
  day_sin: number;
  day_cos: number;
  month: number;
  is_spring_melt: number;

  // 6. Catchment static (5, -1 sentinel for unknown)
  catchment_area: number;
  catchment_slope: number;
  catchment_forest_pct: number;
  catchment_elevation: number;
  catchment_base_flow: number;

  // 7. Lag features (4)
  flow_prev_1d: number | null;
  flow_trend_1d: number | null;
  flow_trend_3d: number | null;
  flow_trend_7d: number | null;

  // 8. Official forecast (6)
  forecast_low: number | null;
  forecast_high: number | null;
  forecast_mid: number | null;
  forecast_spread: number | null;
  forecast_horizon: number | null;
  forecast_bias: number | null;
};

// ---------------------------------------------------------------------------
// Compute context — all inputs for a single target date
// ---------------------------------------------------------------------------

export type ComputeMode = "training" | "prediction";

export interface FeatureComputeContext {
  targetDate: string;
  station: RiverStation;

  /** Sorted ascending by date. Must include ≥14 days before targetDate. */
  weatherBuffer: WeatherWindow[];

  /** Flow values keyed by ISO date. Training: from gauge. Prediction: from prior predictions. */
  flowByDate: Map<string, number>;

  /** Closest official forecast for the target date, or null. */
  forecast: OfficialForecast | null;

  /** Precomputed mean(forecast_mid - observed_flow), or null. */
  forecastBias: number | null;

  /** Full historical weather for soil percentile computation, or null. */
  historicalWeatherForPercentiles: WeatherWindow[] | null;

  mode: ComputeMode;
}
