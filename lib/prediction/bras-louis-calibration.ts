/**
 * Bras-Louis gauge-level calibration constants.
 *
 * Source of truth for the predictor in `bras-louis-gauge.ts`.
 * Refit by `scripts/calibrate-bras-louis.ts` against the workbook
 * observations (n=63, 2016–2019). Leave-one-out cross-validated
 * RMSE = 0.37 m, 84% within ±0.5 m.
 *
 * Model: gauge_m = a + b·Q_valin + c·(dQ/dt)
 *   Q_valin in m³/s, slope in m³/s per hour.
 */

export const BRAS_LOUIS_REFERENCE_STATION_ID = "062701"; // Valin / CEHQ

export type Regime = "spring" | "summer-rising" | "summer-falling";

export interface RegimeFit {
  a: number;
  b: number;
  c: number;
  /** RMSE on the in-sample fit, used as the ±1σ confidence band. */
  rmse: number;
  r2: number;
  n: number;
}

export const BRAS_LOUIS_FIT: Record<Regime, RegimeFit> = {
  spring: { a: 0.740663, b: 0.018155, c: 0.092587, rmse: 0.337, r2: 0.813, n: 26 },
  "summer-rising": { a: 0.115644, b: 0.02407, c: 0.251582, rmse: 0.329, r2: 0.828, n: 19 },
  "summer-falling": { a: 0.037152, b: 0.0243, c: 0.052423, rmse: 0.214, r2: 0.819, n: 18 },
};

/**
 * Above this Valin flow in June, treat as spring (snowmelt) instead
 * of summer. Picks up late snowmelt years.
 */
export const SPRING_JUNE_FLOW_THRESHOLD_M3S = 90;

/** Valid Valin flow range. Outside this we refuse to predict. */
export const VALID_FLOW_RANGE_M3S = { min: 12, max: 220 };

/** Trailing window used to estimate dQ/dt. */
export const SLOPE_WINDOW_HOURS = 3;

/** Minimum Valin samples in the slope window for a trustworthy slope. */
export const MIN_SLOPE_SAMPLES = 4;

/**
 * Refuse if the latest reference reading is older than this. CEHQ
 * timestamps come through the realtime client with timezone quirks
 * (local time stamped Z), so we anchor on the latest sample rather
 * than wall-clock `now`, and only flag genuine staleness here.
 */
export const MAX_REFERENCE_STALENESS_HOURS = 12;

/** Physical clamp on output gauge value (m). The visual scale tops out at 4.5. */
export const GAUGE_OUTPUT_RANGE_M = { min: 0, max: 5 };

/** Display rounding step (m) — matches how paddlers read the gauge. */
export const DISPLAY_LEVEL_STEP_M = 0.25;
