import type { TrainingSample } from "./types";

// ---------------------------------------------------------------------------
// Temporal train / validation / test split (no temporal leakage)
// ---------------------------------------------------------------------------

export interface DataSplit {
  train: TrainingSample[];
  val: TrainingSample[];
  test: TrainingSample[];
}

/**
 * Split samples into train / val / test sets **by time** within each station.
 *
 * For every station the samples are sorted by date ascending, then sliced so
 * that training data is always earlier than validation data, which is always
 * earlier than test data.  This prevents temporal leakage across splits.
 *
 * Stations with fewer than 3 samples are placed entirely in the train set
 * because a meaningful three-way split is not possible.
 *
 * @param samples   - All training samples (any order, may span multiple stations).
 * @param trainRatio - Fraction of each station's data used for training (default 0.70).
 * @param valRatio   - Fraction used for validation (default 0.15).  The remainder
 *                     `1 - trainRatio - valRatio` goes to the test set.
 */
export function temporalSplit(
  samples: TrainingSample[],
  trainRatio: number = 0.70,
  valRatio: number = 0.15,
): DataSplit {
  // --- 1. Group samples by stationId ---
  const byStation = new Map<string, TrainingSample[]>();

  for (const s of samples) {
    const id = s.metadata.stationId;
    let group = byStation.get(id);
    if (!group) {
      group = [];
      byStation.set(id, group);
    }
    group.push(s);
  }

  // --- 2. Build global split arrays ---
  const train: TrainingSample[] = [];
  const val: TrainingSample[] = [];
  const test: TrainingSample[] = [];

  for (const group of byStation.values()) {
    // Sort ascending by date (ISO-8601 strings compare lexicographically)
    group.sort((a, b) => (a.metadata.date < b.metadata.date ? -1 : a.metadata.date > b.metadata.date ? 1 : 0));

    const n = group.length;

    // Stations with fewer than 3 samples go entirely into train
    if (n < 3) {
      train.push(...group);
      continue;
    }

    // Compute cut indices
    const trainEnd = Math.floor(n * trainRatio);
    const valEnd = Math.floor(n * (trainRatio + valRatio));

    // Slice: train = [0, trainEnd), val = [trainEnd, valEnd), test = [valEnd, n)
    for (let i = 0; i < trainEnd; i++) train.push(group[i]);
    for (let i = trainEnd; i < valEnd; i++) val.push(group[i]);
    for (let i = valEnd; i < n; i++) test.push(group[i]);
  }

  return { train, val, test };
}
