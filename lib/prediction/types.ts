import type { RiverStation } from "@/lib/domain/river-station";
import type { FlowReading } from "@/lib/domain/flow-reading";
import type { OfficialForecast } from "@/lib/domain/official-forecast";
import type { PaddlingThreshold } from "@/lib/domain/paddling-threshold";
import type { CorrelatedRiver } from "@/lib/domain/correlated-river";
import type { TrainedModel } from "@/lib/model/types";

// ---------------------------------------------------------------------------
// Forecast output types
// ---------------------------------------------------------------------------

export type ThresholdStatus =
  | "too_low"
  | "low_runnable"
  | "optimal"
  | "high_runnable"
  | "too_high"
  | "unknown";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface DailyForecast {
  date: string;
  /** Predicted flow in m³/s. */
  flow: number;
  /** Lower bound of confidence interval (m³/s). */
  flowLow: number;
  /** Upper bound of confidence interval (m³/s). */
  flowHigh: number;
  /** Prediction horizon in days (1 = tomorrow). */
  horizon: number;
  /** Confidence level based on horizon. */
  confidence: ConfidenceLevel;
  /** Threshold status relative to paddling thresholds. */
  thresholdStatus: ThresholdStatus;
  /** Whether this is from a correlated river estimate. */
  isCorrelated: boolean;
}

export interface ForecastResult {
  stationId: string;
  stationName: string;
  generatedAt: string;
  forecasts: DailyForecast[];
  /** Summary: next window where conditions are optimal. */
  nextOptimalWindow: { startDate: string; endDate: string } | null;
}

// ---------------------------------------------------------------------------
// Prediction inputs
// ---------------------------------------------------------------------------

export interface PredictionInput {
  station: RiverStation;
  model: TrainedModel;
  /** Recent flow readings for lag features. */
  recentFlowReadings?: FlowReading[];
  /** Official forecasts for the prediction period. */
  officialForecasts?: OfficialForecast[];
  /** Precomputed forecast bias, or null. */
  forecastBias?: number | null;
  /** Paddling thresholds for status classification. */
  thresholds?: PaddlingThreshold;
  /** For correlated (ungauged) rivers. */
  correlation?: CorrelatedRiver;
  /** Number of forecast days (default 7). */
  forecastDays?: number;
}
