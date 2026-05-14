/**
 * Predictor registry — every gauge-level predictor that admins can assign
 * to a station registers here. The admin UI lists the entries in
 * `PREDICTORS`, the station stores the `key`, and the river page looks
 * the key up and calls `predict()` with the relevant reference series.
 *
 * To add a new predictor:
 *   1. Implement a `predict(series, at)` pure function under `lib/prediction/`.
 *   2. Add one entry to `PREDICTORS` below pointing at its key,
 *      reference station ID, label, and units.
 *   No DB changes; admins immediately see it in the dropdown.
 */

import type { FlowReading } from "@/lib/domain/flow-reading";

import {
  BRAS_LOUIS_REFERENCE_STATION_ID,
  VALID_FLOW_RANGE_M3S as BL_RANGE,
} from "./bras-louis-calibration";
import {
  predictBrasLouisGauge,
  type BrasLouisRefusal,
} from "./bras-louis-gauge";

export type PredictorRefusal = BrasLouisRefusal;

export interface PredictorOutput {
  /** Predicted reading on the station's local scale. */
  value: number;
  /** Same value rounded for display (e.g., 0.25 m steps on a visual scale). */
  displayValue: number;
  /** ±1σ uncertainty in the same unit as `value`. */
  confidenceBand: number;
  unit: string;
  /** Human-readable regime tag, e.g. "spring", "summer-rising". */
  regime?: string;
  /** Reference station ID + flow used to make this call. */
  referenceStationId: string;
  referenceValue: number;
  asOf: Date;
}

export type PredictorResult =
  | { ok: true; output: PredictorOutput }
  | { ok: false; refusal: PredictorRefusal };

export interface PredictorDefinition {
  /** Stable key persisted in `stations.predictor_key`. */
  key: string;
  /** Short label shown in the admin dropdown and on the river card. */
  label: string;
  /** Longer help text shown under the dropdown. */
  description: string;
  /** CEHQ station ID that the predictor reads from. */
  referenceStationId: string;
  /** Unit symbol shown next to the predicted value. */
  unit: string;
  /** Valid input range of the reference flow (m³/s). Used for refusal hints. */
  referenceFlowRange: { min: number; max: number };
  /**
   * Run the predictor for time `at` (default: now) using a series of
   * reference-station readings (typically the latest 6 h+).
   */
  predict(series: FlowReading[], at?: Date): PredictorResult;
}

const brasLouis: PredictorDefinition = {
  key: "bras-louis",
  label: "Bras-Louis (Valin)",
  description:
    "Regime-aware linear model fit to 63 paired observations (2016–2019). LOO-CV RMSE 0.37 m, 84% within ±0.5 m.",
  referenceStationId: BRAS_LOUIS_REFERENCE_STATION_ID,
  unit: "m",
  referenceFlowRange: BL_RANGE,
  predict(series, at) {
    const res = predictBrasLouisGauge(series, at);
    if (!res.ok) return { ok: false, refusal: res.refusal };
    return {
      ok: true,
      output: {
        value: res.prediction.gaugeM,
        displayValue: res.prediction.displayLevelM,
        confidenceBand: res.prediction.confidenceBandM,
        unit: "m",
        regime: res.prediction.regime,
        referenceStationId: BRAS_LOUIS_REFERENCE_STATION_ID,
        referenceValue: res.prediction.qValinM3s,
        asOf: res.prediction.asOf,
      },
    };
  },
};

export const PREDICTORS: readonly PredictorDefinition[] = [brasLouis] as const;

const byKey = new Map(PREDICTORS.map((p) => [p.key, p]));

export function getPredictor(key: string | null | undefined): PredictorDefinition | null {
  if (!key) return null;
  return byKey.get(key) ?? null;
}

/** The shape sent to client components (no functions, JSON-serialisable). */
export interface PredictorOption {
  key: string;
  label: string;
  description: string;
  referenceStationId: string;
}

export function listPredictorOptions(): PredictorOption[] {
  return PREDICTORS.map(({ key, label, description, referenceStationId }) => ({
    key,
    label,
    description,
    referenceStationId,
  }));
}
