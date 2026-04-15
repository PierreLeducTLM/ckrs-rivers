/**
 * CEHQ forecast bias correction.
 *
 * Observes the divergence between the most recent observed flow and CEHQ's
 * earliest upcoming forecast point, and exposes a time-decaying multiplicative
 * correction that downstream code (chart, status pills, alert pipeline, etc.)
 * can apply to future forecast values.
 *
 *   correctedFlow = rawFlow × (1 + (ratio − 1) × exp(−hoursAhead / decayHours))
 *
 * - hoursAhead = 0 → full correction (rawFlow × ratio)
 * - hoursAhead = decayHours → ~37% of the correction remains
 * - hoursAhead → ∞ → no correction (rawFlow × 1)
 *
 * Rationale for the single-point signal (most recent obs vs earliest forecast):
 * maximum reactivity to current state. If the observed reading genuinely
 * reflects reality, the correction should mirror it immediately. The clamp,
 * dead-band, and exponential decay limit the damage from any outlier reading —
 * a glitch produces at most one cycle of wrong correction, washed out on the
 * next cache refresh.
 *
 * Kept as plain serializable data so it crosses Server→Client Component
 * boundaries cleanly and can be computed in Trigger.dev tasks without
 * importing React or browser-only modules.
 */

/**
 * Maximum staleness (hours) of the most-recent observed point before we
 * suppress the correction. Must be generous enough to cover CEHQ real-time
 * publishing lag + cache refresh cadence (typically 6–12h combined).
 */
const MAX_OBS_STALENESS_HOURS = 24;

/**
 * E-folding time (hours) for the correction's exponential decay back to 1.0.
 * After 24h ~37% of the correction remains; after 72h ~5%.
 */
const CORRECTION_DECAY_HOURS = 24;

/** Lower/upper clamp on the recent observed/forecast ratio (safety rail). */
const RATIO_BOUNDS: [number, number] = [0.3, 2.0];

/** Apply correction only if the ratio deviates this much from 1. */
const RATIO_ACTIVE_THRESHOLD = 0.03;

export interface ForecastPoint {
  ts: number;
  observed: number | null;
  cehqForecast: number | null;
}

export interface ForecastCorrection {
  /** Recent observed/forecast ratio (clamped). Null when no signal available. */
  ratio: number | null;
  /** E-folding time for the decay back to ratio=1, in hours. */
  decayHours: number;
  /** True when the correction is meaningful enough to apply. */
  active: boolean;
}

/** Identity correction (no-op). */
export const NO_CORRECTION: ForecastCorrection = {
  ratio: null,
  decayHours: CORRECTION_DECAY_HOURS,
  active: false,
};

/**
 * Apply a ForecastCorrection to a raw flow value at `hoursAhead` from now.
 * No-op when correction is inactive or `hoursAhead < 0`.
 */
export function applyForecastCorrection(
  rawFlow: number,
  hoursAhead: number,
  correction: ForecastCorrection,
): number {
  if (!correction.active || correction.ratio == null || hoursAhead < 0) {
    return rawFlow;
  }
  const effectiveRatio =
    1 + (correction.ratio - 1) * Math.exp(-hoursAhead / correction.decayHours);
  return rawFlow * effectiveRatio;
}

/**
 * Build a correction from the single most recent observed flow and the single
 * earliest upcoming CEHQ forecast flow in `points`.
 */
export function buildForecastCorrection(
  points: ForecastPoint[],
  nowTs: number,
): ForecastCorrection {
  const maxStaleMs = MAX_OBS_STALENESS_HOURS * 60 * 60 * 1000;

  let latestObserved: { ts: number; flow: number } | null = null;
  for (const p of points) {
    if (p.ts > nowTs || p.observed == null) continue;
    if (p.ts < nowTs - maxStaleMs) continue;
    if (latestObserved == null || p.ts > latestObserved.ts) {
      latestObserved = { ts: p.ts, flow: p.observed };
    }
  }

  let earliestForecast: { ts: number; flow: number } | null = null;
  for (const p of points) {
    if (p.ts <= nowTs || p.cehqForecast == null || p.cehqForecast <= 0) continue;
    if (earliestForecast == null || p.ts < earliestForecast.ts) {
      earliestForecast = { ts: p.ts, flow: p.cehqForecast };
    }
  }

  if (!latestObserved || !earliestForecast) return NO_CORRECTION;

  const rawRatio = latestObserved.flow / earliestForecast.flow;
  const ratio = Math.max(RATIO_BOUNDS[0], Math.min(RATIO_BOUNDS[1], rawRatio));
  const active = Math.abs(ratio - 1) >= RATIO_ACTIVE_THRESHOLD;

  return {
    ratio,
    decayHours: CORRECTION_DECAY_HOURS,
    active,
  };
}

/**
 * Convenience: given a set of hourly-ish points and nowTs, build the
 * correction and return a per-point corrected flow extractor. The callback
 * computes hoursAhead from each point's `ts` and applies the correction.
 */
export function correctedFlowAt(
  rawFlow: number,
  pointTs: number,
  nowTs: number,
  correction: ForecastCorrection,
): number {
  const hoursAhead = (pointTs - nowTs) / (60 * 60 * 1000);
  return applyForecastCorrection(rawFlow, hoursAhead, correction);
}
