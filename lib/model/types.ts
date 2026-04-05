import type { FeatureRow } from "@/lib/features/types";

// ---------------------------------------------------------------------------
// Feature column ordering — maps FeatureRow keys to vector positions
// ---------------------------------------------------------------------------

export const FEATURE_COLUMNS: readonly (keyof Omit<FeatureRow, "_stationId" | "_date">)[] = [
  // Precipitation (7)
  "precip_sum_1d", "precip_sum_2d", "precip_sum_3d", "precip_sum_5d",
  "precip_sum_7d", "precip_sum_14d", "precip_days_since_significant",
  // Snowmelt (8)
  "snow_depth", "snow_depth_change_1d", "snow_depth_change_3d",
  "snow_depth_change_7d", "degree_days_above0_1d", "degree_days_above0_3d",
  "degree_days_above0_7d", "melt_potential",
  // Soil (7)
  "soil_moisture_0_7cm", "soil_moisture_7_28cm", "soil_moisture_28_100cm",
  "soil_trend_0_7cm", "soil_trend_7_28cm", "soil_trend_28_100cm",
  "soil_percentile_0_7cm",
  // Temperature (4)
  "temp_mean", "temp_freeze_thaw", "temp_diurnal_range",
  "temp_degree_days_since_snowfall",
  // Seasonal (4)
  "day_sin", "day_cos", "month", "is_spring_melt",
  // Catchment (5)
  "catchment_area", "catchment_slope", "catchment_forest_pct",
  "catchment_elevation", "catchment_base_flow",
  // Lag (4)
  "flow_prev_1d", "flow_trend_1d", "flow_trend_3d", "flow_trend_7d",
  // Forecast (6)
  "forecast_low", "forecast_high", "forecast_mid", "forecast_spread",
  "forecast_horizon", "forecast_bias",
] as const;

/** Index of the appended prediction_horizon column. */
export const PREDICTION_HORIZON_INDEX = FEATURE_COLUMNS.length; // 45

/** Total number of model input features. */
export const NUM_FEATURES = FEATURE_COLUMNS.length + 1; // 46

// ---------------------------------------------------------------------------
// Training sample
// ---------------------------------------------------------------------------

export interface TrainingSample {
  /** Numeric feature vector (length = NUM_FEATURES). null → NaN, -1 stays. */
  features: Float64Array;
  /** log(flow) — the model's target. */
  target: number;
  metadata: { stationId: string; date: string };
}

// ---------------------------------------------------------------------------
// Model configuration (hyperparameters)
// ---------------------------------------------------------------------------

export interface ModelConfig {
  numRounds: number;
  learningRate: number;
  maxDepth: number;
  minSamplesLeaf: number;
  maxFeaturesPerSplit: number; // 0 = all
  minSplitGain: number;
  l2Regularization: number;
  subsampleRatio: number;
  earlyStoppingRounds: number;
  thresholdFlow: number; // for threshold accuracy metric (m³/s)
}

// ---------------------------------------------------------------------------
// Serialized tree structure
// ---------------------------------------------------------------------------

export interface SerializedLeaf {
  type: "leaf";
  weight: number;
  numSamples: number;
}

export interface SerializedSplit {
  type: "split";
  featureIndex: number;
  threshold: number;
  defaultDirection: "left" | "right";
  left: SerializedTree;
  right: SerializedTree;
}

export type SerializedTree = SerializedLeaf | SerializedSplit;

// ---------------------------------------------------------------------------
// Evaluation results
// ---------------------------------------------------------------------------

export interface EvaluationResult {
  nse: number;
  mape: number;
  thresholdAccuracy: number;
  numSamples: number;
}

// ---------------------------------------------------------------------------
// Trained model (serializable)
// ---------------------------------------------------------------------------

export interface TrainedModel {
  version: 1;
  featureColumns: string[];
  basePrediction: number;
  learningRate: number;
  trees: SerializedTree[];
  trainedAt: string;
  numTrainingSamples: number;
  numRounds: number;
  evaluation: {
    train: EvaluationResult;
    val: EvaluationResult;
    test: EvaluationResult;
  };
}
