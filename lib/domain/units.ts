import { z } from "zod";

// --- Flow & Volume ---

export const CubicMetersPerSecondSchema = z
  .number()
  .nonnegative()
  .brand("m3/s");
export type CubicMetersPerSecond = z.infer<typeof CubicMetersPerSecondSchema>;

// --- Distance & Elevation ---

export const MetersSchema = z.number().brand("m");
export type Meters = z.infer<typeof MetersSchema>;

export const SquareKilometersSchema = z.number().positive().brand("km2");
export type SquareKilometers = z.infer<typeof SquareKilometersSchema>;

// --- Precipitation ---

export const MillimetersSchema = z.number().nonnegative().brand("mm");
export type Millimeters = z.infer<typeof MillimetersSchema>;

export const CentimetersSchema = z.number().nonnegative().brand("cm");
export type Centimeters = z.infer<typeof CentimetersSchema>;

// --- Temperature ---

export const CelsiusSchema = z.number().brand("celsius");
export type Celsius = z.infer<typeof CelsiusSchema>;

// --- Coordinates ---

export const LatitudeSchema = z.number().gte(-90).lte(90).brand("lat");
export type Latitude = z.infer<typeof LatitudeSchema>;

export const LongitudeSchema = z.number().gte(-180).lte(180).brand("lon");
export type Longitude = z.infer<typeof LongitudeSchema>;

export const CoordinatesSchema = z.object({
  lat: LatitudeSchema,
  lon: LongitudeSchema,
});
export type Coordinates = z.infer<typeof CoordinatesSchema>;

// --- Percentages & Fractions ---

export const PercentSchema = z.number().gte(0).lte(100).brand("percent");
export type Percent = z.infer<typeof PercentSchema>;

export const FractionSchema = z.number().gte(0).lte(1).brand("fraction");
export type Fraction = z.infer<typeof FractionSchema>;

// --- Radiation ---

export const WattsPerSquareMeterSchema = z
  .number()
  .nonnegative()
  .brand("W/m2");
export type WattsPerSquareMeter = z.infer<typeof WattsPerSquareMeterSchema>;

// --- Wind ---

export const MetersPerSecondSchema = z.number().nonnegative().brand("m/s");
export type MetersPerSecond = z.infer<typeof MetersPerSecondSchema>;

// --- Time ---

export const HoursSchema = z.number().brand("hours");
export type Hours = z.infer<typeof HoursSchema>;

export const DaysSchema = z.number().int().nonnegative().brand("days");
export type Days = z.infer<typeof DaysSchema>;
