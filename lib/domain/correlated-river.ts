import { z } from "zod";

import {
  CubicMetersPerSecondSchema,
  HoursSchema,
  FractionSchema,
} from "./units";

// --- Correlation Function Variants ---

export const LinearCorrelationSchema = z.object({
  type: z.literal("linear"),
  ratio: z.number().positive(),
  offset: CubicMetersPerSecondSchema,
});

export const OffsetCorrelationSchema = z.object({
  type: z.literal("offset"),
  offset: CubicMetersPerSecondSchema,
});

export const PowerCorrelationSchema = z.object({
  type: z.literal("power"),
  coefficient: z.number().positive(),
  exponent: z.number(),
});

export const CorrelationFunctionSchema = z.discriminatedUnion("type", [
  LinearCorrelationSchema,
  OffsetCorrelationSchema,
  PowerCorrelationSchema,
]);

export type CorrelationFunction = z.infer<typeof CorrelationFunctionSchema>;

// --- Correlated River Entity ---

export const CorrelatedRiverSchema = z.object({
  /** Station ID of the ungauged river whose flow is being estimated. */
  stationId: z.string().min(1),

  /** Station ID of the gauged reference river used as the predictor. */
  referenceStationId: z.string().min(1),

  /** Mathematical relationship between the two stations' flows. */
  correlation: CorrelationFunctionSchema,

  /**
   * Time offset in hours between the two stations.
   * Positive means the ungauged river peaks later than the reference.
   */
  timeOffsetHours: HoursSchema,

  /** Confidence in the correlation, from 0 (none) to 1 (perfect). */
  confidence: FractionSchema,
});

export type CorrelatedRiver = z.infer<typeof CorrelatedRiverSchema>;
