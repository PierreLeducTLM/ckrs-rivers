import type { FeatureComputeContext } from "./types";
import { n } from "./utils";

/**
 * Computes static catchment features from the RiverStation.
 * Uses -1 sentinel for unknown (undefined) values.
 */
export function catchmentFeatures(ctx: FeatureComputeContext) {
  const { station } = ctx;

  return {
    catchment_area:
      station.catchmentArea !== undefined ? n(station.catchmentArea) : -1,
    catchment_slope: station.catchmentSlope ?? -1,
    catchment_forest_pct:
      station.landCover?.forest !== undefined
        ? n(station.landCover.forest)
        : -1,
    catchment_elevation:
      station.elevation !== undefined ? n(station.elevation) : -1,
    catchment_base_flow:
      station.baseFlow !== undefined ? n(station.baseFlow) : -1,
  };
}
