import { z } from "zod";

import { WindDirectionSchema } from "./enums";
import {
  CelsiusSchema,
  CentimetersSchema,
  FractionSchema,
  MetersPerSecondSchema,
  MetersSchema,
  MillimetersSchema,
  WattsPerSquareMeterSchema,
} from "./units";

// --- Temperature ---

export const TemperatureSchema = z.object({
  min: CelsiusSchema,
  max: CelsiusSchema,
  mean: CelsiusSchema,
});

export type Temperature = z.infer<typeof TemperatureSchema>;

// --- Soil Moisture ---

export const SoilMoistureSchema = z.object({
  depth0to7cm: FractionSchema.optional(),
  depth7to28cm: FractionSchema.optional(),
  depth28to100cm: FractionSchema.optional(),
});

export type SoilMoisture = z.infer<typeof SoilMoistureSchema>;

// --- Wind ---

export const WindSchema = z.object({
  speed: MetersPerSecondSchema,
  direction: WindDirectionSchema.optional(),
});

export type Wind = z.infer<typeof WindSchema>;

// --- Weather Window ---

export const WeatherWindowSchema = z.object({
  stationId: z.string().min(1),
  date: z.iso.date(),
  precipitation: MillimetersSchema,
  snowfall: CentimetersSchema,
  snowDepth: CentimetersSchema,
  temperature: TemperatureSchema,
  soilMoisture: SoilMoistureSchema.optional(),
  wind: WindSchema.optional(),
  solarRadiation: WattsPerSquareMeterSchema.optional(),
  freezingLevel: MetersSchema.optional(),
});

export type WeatherWindow = z.infer<typeof WeatherWindowSchema>;
