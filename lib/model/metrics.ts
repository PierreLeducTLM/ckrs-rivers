import type { EvaluationResult } from "./types";

// ---------------------------------------------------------------------------
// Nash-Sutcliffe Efficiency (log space)
// ---------------------------------------------------------------------------

/**
 * Computes Nash-Sutcliffe Efficiency in log space.
 *
 * NSE = 1 - sum((obs[i] - pred[i])^2) / sum((obs[i] - mean(obs))^2)
 *
 * Returns 1.0 for a perfect match, 0.0 if the model is no better than the
 * mean of observations, and negative values if it is worse.
 *
 * When all observations are identical (denominator is 0), returns 1.0 if
 * predictions also match exactly, otherwise 0.0.
 */
export function computeNSE(
  observedLog: number[],
  predictedLog: number[],
): number {
  const n = observedLog.length;
  if (n === 0) return 0.0;

  let meanObs = 0;
  for (let i = 0; i < n; i++) {
    meanObs += observedLog[i];
  }
  meanObs /= n;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const residual = observedLog[i] - predictedLog[i];
    ssRes += residual * residual;

    const deviation = observedLog[i] - meanObs;
    ssTot += deviation * deviation;
  }

  if (ssTot === 0) {
    return ssRes === 0 ? 1.0 : 0.0;
  }

  return 1 - ssRes / ssTot;
}

// ---------------------------------------------------------------------------
// Mean Absolute Percentage Error (real flow space)
// ---------------------------------------------------------------------------

/**
 * Computes Mean Absolute Percentage Error on real (non-log) flow values.
 *
 * For each sample, flow is recovered via exp(logValue). Samples where the
 * observed flow is 0 are skipped to avoid division by zero.
 *
 * @returns Percentage value (0-100+).
 */
export function computeMAPE(
  observedLog: number[],
  predictedLog: number[],
): number {
  const n = observedLog.length;
  let sum = 0;
  let count = 0;

  for (let i = 0; i < n; i++) {
    const obsFlow = Math.exp(observedLog[i]);
    if (obsFlow === 0) continue;

    const predFlow = Math.exp(predictedLog[i]);
    sum += Math.abs(obsFlow - predFlow) / obsFlow;
    count++;
  }

  if (count === 0) return 0;
  return (sum / count) * 100;
}

// ---------------------------------------------------------------------------
// Threshold accuracy
// ---------------------------------------------------------------------------

/**
 * Fraction of days where the model correctly classifies observed flow as
 * above or below the given threshold.
 *
 * Both observed and predicted values are converted from log space via exp().
 *
 * @returns Fraction between 0 and 1.
 */
export function computeThresholdAccuracy(
  observedLog: number[],
  predictedLog: number[],
  thresholdFlow: number,
): number {
  const n = observedLog.length;
  if (n === 0) return 0;

  let correct = 0;
  for (let i = 0; i < n; i++) {
    const obsFlow = Math.exp(observedLog[i]);
    const predFlow = Math.exp(predictedLog[i]);

    if ((obsFlow >= thresholdFlow) === (predFlow >= thresholdFlow)) {
      correct++;
    }
  }

  return correct / n;
}

// ---------------------------------------------------------------------------
// Full evaluation
// ---------------------------------------------------------------------------

/**
 * Runs all evaluation metrics and returns a consolidated result.
 */
export function evaluate(
  observedLog: number[],
  predictedLog: number[],
  thresholdFlow: number,
): EvaluationResult {
  return {
    nse: computeNSE(observedLog, predictedLog),
    mape: computeMAPE(observedLog, predictedLog),
    thresholdAccuracy: computeThresholdAccuracy(
      observedLog,
      predictedLog,
      thresholdFlow,
    ),
    numSamples: observedLog.length,
  };
}
