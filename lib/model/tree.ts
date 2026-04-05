import type { ModelConfig, SerializedTree } from "./types";

// ---------------------------------------------------------------------------
// Internal tree node type
// ---------------------------------------------------------------------------

export type TreeNode =
  | { kind: "leaf"; weight: number; numSamples: number }
  | {
      kind: "split";
      featureIndex: number;
      threshold: number;
      defaultDirection: "left" | "right";
      left: TreeNode;
      right: TreeNode;
    };

// ---------------------------------------------------------------------------
// 1. fitTree — build a CART regression tree with NaN-aware splitting
// ---------------------------------------------------------------------------

export function fitTree(
  sampleIndices: number[],
  features: Float64Array[],
  targets: ArrayLike<number>,
  config: ModelConfig,
): TreeNode {
  const numFeatures = features[0].length;

  function makeLeaf(indices: number[]): TreeNode {
    let sum = 0;
    for (let i = 0; i < indices.length; i++) {
      sum += targets[indices[i]];
    }
    return {
      kind: "leaf",
      weight: sum / (indices.length + config.l2Regularization),
      numSamples: indices.length,
    };
  }

  function buildNode(indices: number[], depth: number): TreeNode {
    // Base cases
    if (
      depth >= config.maxDepth ||
      indices.length < 2 * config.minSamplesLeaf
    ) {
      return makeLeaf(indices);
    }

    // Determine which feature indices to evaluate
    let featureIndices: number[];
    if (config.maxFeaturesPerSplit > 0 && config.maxFeaturesPerSplit < numFeatures) {
      // Fisher-Yates partial shuffle
      featureIndices = Array.from({ length: numFeatures }, (_, i) => i);
      const k = config.maxFeaturesPerSplit;
      for (let i = 0; i < k; i++) {
        const j = i + Math.floor(Math.random() * (numFeatures - i));
        const tmp = featureIndices[i];
        featureIndices[i] = featureIndices[j];
        featureIndices[j] = tmp;
      }
      featureIndices = featureIndices.slice(0, k);
    } else {
      featureIndices = Array.from({ length: numFeatures }, (_, i) => i);
    }

    let bestGain = -Infinity;
    let bestFeature = -1;
    let bestThreshold = 0;
    let bestDirection: "left" | "right" = "left";
    let bestLeftIndices: number[] = [];
    let bestRightIndices: number[] = [];

    // Precompute total sum for the node
    let totalSum = 0;
    for (let i = 0; i < indices.length; i++) {
      totalSum += targets[indices[i]];
    }
    const totalCount = indices.length;
    const totalVariance = (totalSum * totalSum) / totalCount;

    for (const fi of featureIndices) {
      // Separate NaN from non-NaN
      const nanIndices: number[] = [];
      const validPairs: { idx: number; val: number }[] = [];

      for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        const v = features[idx][fi];
        if (Number.isNaN(v)) {
          nanIndices.push(idx);
        } else {
          validPairs.push({ idx, val: v });
        }
      }

      if (validPairs.length < 2 * config.minSamplesLeaf) continue;

      // Sort valid samples by feature value
      validPairs.sort((a, b) => a.val - b.val);

      // Precompute NaN sum
      let nanSum = 0;
      for (let i = 0; i < nanIndices.length; i++) {
        nanSum += targets[nanIndices[i]];
      }
      const nanCount = nanIndices.length;

      // Running sums for the scan
      let leftSum = 0;
      let leftCount = 0;
      let rightSum = 0;
      for (let i = 0; i < validPairs.length; i++) {
        rightSum += targets[validPairs[i].idx];
      }
      let rightCount = validPairs.length;

      // Scan through sorted values
      for (let i = 0; i < validPairs.length - 1; i++) {
        const t = targets[validPairs[i].idx];
        leftSum += t;
        leftCount++;
        rightSum -= t;
        rightCount--;

        // Skip equal consecutive values
        if (validPairs[i].val === validPairs[i + 1].val) continue;

        // Check minimum leaf size (without NaN samples)
        if (leftCount < config.minSamplesLeaf || rightCount < config.minSamplesLeaf) continue;

        const threshold = (validPairs[i].val + validPairs[i + 1].val) / 2;

        // Try NaN going left
        const lSumNanLeft = leftSum + nanSum;
        const lCountNanLeft = leftCount + nanCount;
        const rSumNanLeft = rightSum;
        const rCountNanLeft = rightCount;

        let gainNanLeft = -Infinity;
        if (lCountNanLeft >= config.minSamplesLeaf && rCountNanLeft >= config.minSamplesLeaf) {
          gainNanLeft =
            (lSumNanLeft * lSumNanLeft) / lCountNanLeft +
            (rSumNanLeft * rSumNanLeft) / rCountNanLeft -
            totalVariance;
        }

        // Try NaN going right
        const lSumNanRight = leftSum;
        const lCountNanRight = leftCount;
        const rSumNanRight = rightSum + nanSum;
        const rCountNanRight = rightCount + nanCount;

        let gainNanRight = -Infinity;
        if (lCountNanRight >= config.minSamplesLeaf && rCountNanRight >= config.minSamplesLeaf) {
          gainNanRight =
            (lSumNanRight * lSumNanRight) / lCountNanRight +
            (rSumNanRight * rSumNanRight) / rCountNanRight -
            totalVariance;
        }

        const gain = Math.max(gainNanLeft, gainNanRight);
        const direction: "left" | "right" =
          gainNanLeft >= gainNanRight ? "left" : "right";

        if (gain > bestGain) {
          bestGain = gain;
          bestFeature = fi;
          bestThreshold = threshold;
          bestDirection = direction;

          // Build left/right index arrays for this split
          const leftIdx: number[] = [];
          const rightIdx: number[] = [];
          for (let j = 0; j <= i; j++) leftIdx.push(validPairs[j].idx);
          for (let j = i + 1; j < validPairs.length; j++) rightIdx.push(validPairs[j].idx);
          if (direction === "left") {
            for (let j = 0; j < nanIndices.length; j++) leftIdx.push(nanIndices[j]);
          } else {
            for (let j = 0; j < nanIndices.length; j++) rightIdx.push(nanIndices[j]);
          }
          bestLeftIndices = leftIdx;
          bestRightIndices = rightIdx;
        }
      }
    }

    // No valid split found or gain too small
    if (bestFeature === -1 || bestGain <= config.minSplitGain) {
      return makeLeaf(indices);
    }

    return {
      kind: "split",
      featureIndex: bestFeature,
      threshold: bestThreshold,
      defaultDirection: bestDirection,
      left: buildNode(bestLeftIndices, depth + 1),
      right: buildNode(bestRightIndices, depth + 1),
    };
  }

  return buildNode(sampleIndices, 0);
}

// ---------------------------------------------------------------------------
// 2. predictTree — traverse a fitted tree for a single sample
// ---------------------------------------------------------------------------

export function predictTree(node: TreeNode, features: Float64Array): number {
  if (node.kind === "leaf") return node.weight;

  const value = features[node.featureIndex];
  if (Number.isNaN(value)) {
    return node.defaultDirection === "left"
      ? predictTree(node.left, features)
      : predictTree(node.right, features);
  }
  return value <= node.threshold
    ? predictTree(node.left, features)
    : predictTree(node.right, features);
}

// ---------------------------------------------------------------------------
// 3. serializeTree — convert TreeNode to SerializedTree
// ---------------------------------------------------------------------------

export function serializeTree(node: TreeNode): SerializedTree {
  if (node.kind === "leaf") {
    return { type: "leaf", weight: node.weight, numSamples: node.numSamples };
  }
  return {
    type: "split",
    featureIndex: node.featureIndex,
    threshold: node.threshold,
    defaultDirection: node.defaultDirection,
    left: serializeTree(node.left),
    right: serializeTree(node.right),
  };
}

// ---------------------------------------------------------------------------
// 4. deserializeTree — convert SerializedTree back to TreeNode
// ---------------------------------------------------------------------------

export function deserializeTree(data: SerializedTree): TreeNode {
  if (data.type === "leaf") {
    return { kind: "leaf", weight: data.weight, numSamples: data.numSamples };
  }
  return {
    kind: "split",
    featureIndex: data.featureIndex,
    threshold: data.threshold,
    defaultDirection: data.defaultDirection,
    left: deserializeTree(data.left),
    right: deserializeTree(data.right),
  };
}
