import type { FeatureRow } from "@/lib/features/types";
import type { FlowReading } from "@/lib/domain/flow-reading";
import type { TrainedModel, ModelConfig } from "./types";
import { DEFAULT_MODEL_CONFIG } from "./config";
import { buildTrainingDataset } from "./dataset";
import { temporalSplit } from "./split";
import { trainGBM, predictGBM, type GBMPredictor } from "./gradient-boost";
import { serializeTree } from "./tree";
import { evaluate } from "./metrics";
import { FEATURE_COLUMNS } from "./types";

// ---------------------------------------------------------------------------
// Training pipeline
// ---------------------------------------------------------------------------

/**
 * End-to-end training pipeline: builds a dataset from raw feature rows and
 * flow readings, splits temporally, trains a gradient-boosted model with
 * early stopping, evaluates on all splits, and returns a fully serializable
 * TrainedModel.
 */
export function trainModel(params: {
  featureRows: FeatureRow[];
  flowReadings: FlowReading[];
  config?: Partial<ModelConfig>;
  onProgress?: (info: {
    round: number;
    totalRounds: number;
    valLoss: number;
  }) => void;
}): TrainedModel {
  // 1. Merge user config with defaults
  const config: ModelConfig = { ...DEFAULT_MODEL_CONFIG, ...params.config };

  // 2. Build dataset
  const samples = buildTrainingDataset(params.featureRows, params.flowReadings);

  // 3. Validate minimum sample count
  if (samples.length < 30) {
    throw new Error(
      "Insufficient training data: need at least 30 samples",
    );
  }

  // 4. Temporal split
  const split = temporalSplit(samples);

  // 5. Train GBM
  const result = trainGBM(split.train, split.val, config, params.onProgress);

  // 6. Build predictor for evaluation
  const predictor: GBMPredictor = {
    trees: result.trees,
    basePrediction: result.basePrediction,
    learningRate: config.learningRate,
  };

  // 7. Generate predictions for each split
  const splitSets = [
    { name: "train" as const, data: split.train },
    { name: "val" as const, data: split.val },
    { name: "test" as const, data: split.test },
  ] as const;

  const evaluations: Record<string, ReturnType<typeof evaluate>> = {};

  for (const { name, data } of splitSets) {
    const observedLog: number[] = [];
    const predictedLog: number[] = [];

    for (const sample of data) {
      observedLog.push(sample.target);
      predictedLog.push(predictGBM(predictor, sample.features));
    }

    evaluations[name] = evaluate(observedLog, predictedLog, config.thresholdFlow);
  }

  // 8. Serialize trees
  const serializedTrees = result.trees.map(serializeTree);

  // 9. Return the complete trained model
  return {
    version: 1,
    featureColumns: [...FEATURE_COLUMNS],
    basePrediction: result.basePrediction,
    learningRate: config.learningRate,
    trees: serializedTrees,
    trainedAt: new Date().toISOString(),
    numTrainingSamples: split.train.length,
    numRounds: result.trees.length,
    evaluation: {
      train: evaluations.train,
      val: evaluations.val,
      test: evaluations.test,
    },
  };
}
