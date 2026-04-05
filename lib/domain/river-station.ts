import { z } from "zod";

import { RiverBedTypeSchema, OrientationSchema } from "./enums";
import {
  CoordinatesSchema,
  MetersSchema,
  SquareKilometersSchema,
  CubicMetersPerSecondSchema,
  PercentSchema,
} from "./units";

// --- Land Cover Profile ---

export const LandCoverProfileSchema = z
  .object({
    forest: PercentSchema,
    rock: PercentSchema,
    urban: PercentSchema,
    agricultural: PercentSchema,
  })
  .refine(
    (data) => data.forest + data.rock + data.urban + data.agricultural <= 100,
    { message: "Land cover percentages must sum to 100 or less" },
  );

export type LandCoverProfile = z.infer<typeof LandCoverProfileSchema>;

// --- River Station ---

export const RiverStationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  coordinates: CoordinatesSchema,
  elevation: MetersSchema.optional(),
  catchmentArea: SquareKilometersSchema.optional(),
  catchmentSlope: z.number().nonnegative().optional(),
  landCover: LandCoverProfileSchema.optional(),
  baseFlow: CubicMetersPerSecondSchema.optional(),
  riverBedType: RiverBedTypeSchema.optional(),
  orientation: OrientationSchema.optional(),
});

export type RiverStation = z.infer<typeof RiverStationSchema>;
