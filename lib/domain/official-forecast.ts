import { z } from "zod";

import { CubicMetersPerSecondSchema, DaysSchema } from "./units";

export const OfficialForecastSchema = z
  .object({
    stationId: z.string().min(1),
    issuedAt: z.iso.datetime(),
    targetDate: z.iso.date(),
    lowBound: CubicMetersPerSecondSchema,
    highBound: CubicMetersPerSecondSchema,
    source: z.string().min(1),
    horizonDays: DaysSchema,
  })
  .refine((d) => d.highBound >= d.lowBound, {
    message: "highBound must be greater than or equal to lowBound",
    path: ["highBound"],
  });

export type OfficialForecast = z.infer<typeof OfficialForecastSchema>;
