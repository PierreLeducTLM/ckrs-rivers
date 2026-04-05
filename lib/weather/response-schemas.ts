import { z } from "zod";

/**
 * Zod schemas matching the raw JSON structure returned by Open-Meteo's
 * archive and forecast APIs. These are NOT domain types — they represent
 * the API wire format exactly.
 *
 * Daily variables are returned as parallel arrays aligned to `daily.time`.
 * Hourly variables (snow_depth, soil_moisture) are returned as parallel arrays
 * aligned to `hourly.time` — the mapper aggregates these to daily resolution.
 */

export const OpenMeteoDailySchema = z.object({
  time: z.array(z.string()),
  precipitation_sum: z.array(z.number().nullable()),
  snowfall_sum: z.array(z.number().nullable()),
  temperature_2m_max: z.array(z.number().nullable()),
  temperature_2m_min: z.array(z.number().nullable()),
  temperature_2m_mean: z.array(z.number().nullable()),
  wind_speed_10m_max: z.array(z.number().nullable()).optional(),
  shortwave_radiation_sum: z.array(z.number().nullable()).optional(),
});

export type OpenMeteoDaily = z.infer<typeof OpenMeteoDailySchema>;

export const OpenMeteoHourlySchema = z.object({
  time: z.array(z.string()),
  snow_depth: z.array(z.number().nullable()).optional(),
  soil_moisture_0_to_7cm: z.array(z.number().nullable()).optional(),
  soil_moisture_7_to_28cm: z.array(z.number().nullable()).optional(),
  soil_moisture_28_to_100cm: z.array(z.number().nullable()).optional(),
});

export type OpenMeteoHourly = z.infer<typeof OpenMeteoHourlySchema>;

export const OpenMeteoResponseSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  elevation: z.number(),
  utc_offset_seconds: z.number(),
  daily: OpenMeteoDailySchema,
  hourly: OpenMeteoHourlySchema.optional(),
});

export type OpenMeteoResponse = z.infer<typeof OpenMeteoResponseSchema>;
