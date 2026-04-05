import type { TrainedModel } from "./types";
import { type TreeNode, deserializeTree } from "./tree";

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Serializes a trained model to a JSON string.
 */
export function serializeModel(model: TrainedModel): string {
  return JSON.stringify(model, null, 2);
}

// ---------------------------------------------------------------------------
// Deserialization
// ---------------------------------------------------------------------------

/**
 * Deserializes a JSON string back into a TrainedModel.
 *
 * Validates that the payload contains `version === 1` and a `trees` array.
 * Throws if the JSON is malformed or the schema check fails.
 */
export function deserializeModel(json: string): TrainedModel {
  const parsed = JSON.parse(json) as unknown;

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("version" in parsed) ||
    !("trees" in parsed)
  ) {
    throw new Error("Invalid model JSON: missing required fields");
  }

  const record = parsed as Record<string, unknown>;

  if (record.version !== 1) {
    throw new Error(
      `Unsupported model version: ${String(record.version)} (expected 1)`,
    );
  }

  if (!Array.isArray(record.trees)) {
    throw new Error("Invalid model JSON: `trees` must be an array");
  }

  return parsed as TrainedModel;
}

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

/**
 * Converts a serialized TrainedModel into live tree structures ready for
 * prediction.
 *
 * Each `SerializedTree` is recursively converted to a `TreeNode` via
 * `deserializeTree`, and the base prediction / learning rate are extracted
 * for convenient use with the GBM predictor.
 */
export function hydrateModel(model: TrainedModel): {
  trees: TreeNode[];
  basePrediction: number;
  learningRate: number;
} {
  const trees: TreeNode[] = model.trees.map(deserializeTree);

  return {
    trees,
    basePrediction: model.basePrediction,
    learningRate: model.learningRate,
  };
}
