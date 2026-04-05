import { z } from "zod";

import { FlowReadingSourceSchema, QualityFlagSchema } from "./enums";
import { CubicMetersPerSecondSchema, MetersSchema } from "./units";

export const FlowReadingSchema = z
  .object({
    stationId: z.string().min(1),
    timestamp: z.iso.datetime(),
    flow: CubicMetersPerSecondSchema.optional(),
    waterLevel: MetersSchema.optional(),
    source: FlowReadingSourceSchema,
    quality: QualityFlagSchema,
  })
  .refine((data) => data.flow !== undefined || data.waterLevel !== undefined, {
    message: "At least one of `flow` or `waterLevel` must be present",
  });

export type FlowReading = z.infer<typeof FlowReadingSchema>;
