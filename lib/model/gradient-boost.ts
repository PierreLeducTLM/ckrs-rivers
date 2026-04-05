import type { TrainingSample, ModelConfig } from "./types";
import { type TreeNode, fitTree, predictTree } from "./tree";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GBMResult {
  trees: TreeNode[];
  basePrediction: number;
  bestRound: number;
}

export interface GBMPredictor {
  trees: TreeNode[];
  basePrediction: number;
  learningRate: number;
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

/**
 * Train a gradient boosted regression tree ensemble with early stopping.
 *
 * The model fits sequential trees to the residuals (pseudo-gradients) of the
 * squared-error loss.  Validation loss is tracked every round and training
 * stops early when no improvement is seen for `config.earlyStoppingRounds`
 * consecutive rounds.  The returned tree array is truncated to the best round.
 */
export function trainGBM(
  train: TrainingSample[],
  val: TrainingSample[],
  config: ModelConfig,
  onProgress?: (info: {
    round: number;
    totalRounds: number;
    valLoss: number;
  }) => void,
): GBMResult {
  const {
    numRounds,
    learningRate,
    subsampleRatio,
    earlyStoppingRounds,
  } = config;

  const nTrain = train.length;
  const nVal = val.length;

  // --- Step 1: Base prediction (mean of training targets) ----------------
  let targetSum = 0;
  for (let i = 0; i < nTrain; i++) targetSum += train[i].target;
  const basePrediction = targetSum / nTrain;

  // --- Step 2: Initialise prediction accumulators ------------------------
  const trainPreds = new Float64Array(nTrain).fill(basePrediction);
  const valPreds = new Float64Array(nVal).fill(basePrediction);

  // --- Step 3: Extract feature / target arrays ---------------------------
  const trainFeatures: Float64Array[] = new Array(nTrain);
  const trainTargets = new Float64Array(nTrain);
  for (let i = 0; i < nTrain; i++) {
    trainFeatures[i] = train[i].features;
    trainTargets[i] = train[i].target;
  }

  const valFeatures: Float64Array[] = new Array(nVal);
  const valTargets = new Float64Array(nVal);
  for (let i = 0; i < nVal; i++) {
    valFeatures[i] = val[i].features;
    valTargets[i] = val[i].target;
  }

  // --- Step 4: Boosting loop ---------------------------------------------
  const trees: TreeNode[] = [];
  const residuals = new Float64Array(nTrain);

  let bestValLoss = Infinity;
  let bestRound = 0;
  let roundsSinceImprovement = 0;

  for (let round = 0; round < numRounds; round++) {
    // 6a – Compute residuals (negative gradient of squared-error loss)
    for (let i = 0; i < nTrain; i++) {
      residuals[i] = trainTargets[i] - trainPreds[i];
    }

    // 6b – Subsample indices
    let sampleIndices: number[];
    if (subsampleRatio < 1) {
      sampleIndices = [];
      for (let i = 0; i < nTrain; i++) {
        if (Math.random() < subsampleRatio) sampleIndices.push(i);
      }
      // Guarantee at least one sample
      if (sampleIndices.length === 0) {
        sampleIndices.push(Math.floor(Math.random() * nTrain));
      }
    } else {
      sampleIndices = Array.from({ length: nTrain }, (_, i) => i);
    }

    // 6c – Fit a single regression tree to residuals
    const tree = fitTree(sampleIndices, trainFeatures, residuals, config);
    trees.push(tree);

    // 6d – Update training predictions
    for (let i = 0; i < nTrain; i++) {
      trainPreds[i] += learningRate * predictTree(tree, trainFeatures[i]);
    }

    // 6e – Update validation predictions
    for (let i = 0; i < nVal; i++) {
      valPreds[i] += learningRate * predictTree(tree, valFeatures[i]);
    }

    // 6f – Compute validation MSE
    let mseSum = 0;
    for (let i = 0; i < nVal; i++) {
      const err = valTargets[i] - valPreds[i];
      mseSum += err * err;
    }
    const valLoss = mseSum / nVal;

    // 6g – Report progress
    if (onProgress) {
      onProgress({ round, totalRounds: numRounds, valLoss });
    }

    // 6h – Early stopping
    if (valLoss < bestValLoss) {
      bestValLoss = valLoss;
      bestRound = round;
      roundsSinceImprovement = 0;
    } else {
      roundsSinceImprovement++;
      if (roundsSinceImprovement >= earlyStoppingRounds) break;
    }
  }

  // --- Step 7: Truncate to best round ------------------------------------
  trees.length = bestRound + 1;

  return { trees, basePrediction, bestRound };
}

// ---------------------------------------------------------------------------
// Prediction (log-space)
// ---------------------------------------------------------------------------

/**
 * Predict in log-space (the model's native output space).
 *
 * The returned value equals `basePrediction + lr * sum(tree predictions)`.
 */
export function predictGBM(
  model: GBMPredictor,
  features: Float64Array,
): number {
  let pred = model.basePrediction;
  for (const tree of model.trees) {
    pred += model.learningRate * predictTree(tree, features);
  }
  return pred;
}

// ---------------------------------------------------------------------------
// Prediction (real flow, m³/s)
// ---------------------------------------------------------------------------

/**
 * Predict real flow in m³/s by exponentiating the log-space prediction.
 */
export function predictFlow(
  model: GBMPredictor,
  features: Float64Array,
): number {
  return Math.exp(predictGBM(model, features));
}
