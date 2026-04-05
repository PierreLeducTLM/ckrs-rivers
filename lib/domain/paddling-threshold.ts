import { z } from "zod";

import { SkillLevelSchema } from "./enums";
import { CubicMetersPerSecondSchema } from "./units";

export const FlowRangeSchema = z
  .object({
    min: CubicMetersPerSecondSchema,
    max: CubicMetersPerSecondSchema,
  })
  .refine((data) => data.max >= data.min, {
    message: "`max` must be greater than or equal to `min`",
  });

export type FlowRange = z.infer<typeof FlowRangeSchema>;

export const PaddlingThresholdSchema = z
  .object({
    stationId: z.string().min(1),
    skillLevel: SkillLevelSchema,
    tooLow: FlowRangeSchema,
    lowRunnable: FlowRangeSchema,
    optimal: FlowRangeSchema,
    highRunnable: FlowRangeSchema,
    tooHigh: FlowRangeSchema,
  })
  .refine(
    (data) =>
      data.tooLow.max <= data.lowRunnable.min &&
      data.lowRunnable.max <= data.optimal.min &&
      data.optimal.max <= data.highRunnable.min &&
      data.highRunnable.max <= data.tooHigh.min,
    {
      message:
        "Flow ranges must be in monotonic order: tooLow <= lowRunnable <= optimal <= highRunnable <= tooHigh",
    },
  );

export type PaddlingThreshold = z.infer<typeof PaddlingThresholdSchema>;
