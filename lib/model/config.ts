import type { ModelConfig } from "./types";

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  numRounds: 200,
  learningRate: 0.1,
  maxDepth: 6,
  minSamplesLeaf: 5,
  maxFeaturesPerSplit: 0,
  minSplitGain: 0.0,
  l2Regularization: 1.0,
  subsampleRatio: 0.8,
  earlyStoppingRounds: 20,
  thresholdFlow: 15,
};
