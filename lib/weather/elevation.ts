import {
  WeatherWindowSchema,
  type WeatherWindow,
} from "@/lib/domain/weather-window";

// ---------- Constants ----------

const LAPSE_RATE_PER_1000M = 6.5; // °C per 1000 m elevation gain
const OROGRAPHIC_FACTOR_PER_1000M = 0.3; // 30 % more precip per 1000 m
const MAX_PRECIP_MULTIPLIER = 2.0;

// ---------- Public API ----------

/**
 * Apply elevation-based corrections to weather data.
 *
 * When the grid-cell elevation (from the Open-Meteo response) differs from the
 * station elevation we adjust temperature (adiabatic lapse rate) and
 * precipitation (orographic enhancement).  A rough freezing-level estimate is
 * added when the original window does not already carry one.
 *
 * @param windows        - Raw weather windows from the data source.
 * @param gridElevation  - DEM elevation of the grid cell (metres, plain number).
 * @param stationElevation - Observed station elevation. If `undefined` the
 *                           windows are returned unchanged.
 * @returns Adjusted (and re-parsed) weather windows.
 */
export function adjustForElevation(
  windows: WeatherWindow[],
  gridElevation: number,
  stationElevation: number | undefined,
): WeatherWindow[] {
  if (stationElevation === undefined) {
    return windows;
  }

  // Positive when the station sits above the grid cell.
  const elevDiff = stationElevation - gridElevation;

  const adjusted: WeatherWindow[] = [];

  for (const w of windows) {
    try {
      adjusted.push(adjustWindow(w, elevDiff, stationElevation));
    } catch {
      // Schema parse failure after adjustment — skip this window.
    }
  }

  return adjusted;
}

// ---------- Internals ----------

function adjustWindow(
  w: WeatherWindow,
  elevDiff: number,
  stationElevation: number,
): WeatherWindow {
  // --- Temperature ---
  // Station higher than grid → tempOffset is negative → cooler
  const tempOffset = -(elevDiff * LAPSE_RATE_PER_1000M) / 1000;

  const adjustedMin = w.temperature.min + tempOffset;
  const adjustedMax = w.temperature.max + tempOffset;
  const adjustedMean = w.temperature.mean + tempOffset;

  // --- Precipitation ---
  let precipMultiplier =
    1 + OROGRAPHIC_FACTOR_PER_1000M * (elevDiff / 1000);

  precipMultiplier = Math.min(precipMultiplier, MAX_PRECIP_MULTIPLIER);

  // Don't reduce precipitation by more than 50 % when station is lower.
  if (elevDiff < 0) {
    precipMultiplier = Math.max(precipMultiplier, 0.5);
  }

  const adjustedPrecipitation = w.precipitation * precipMultiplier;
  const adjustedSnowfall = w.snowfall * precipMultiplier;

  // --- Freezing level estimation ---
  let freezingLevel: number | undefined = w.freezingLevel as
    | number
    | undefined;

  if (freezingLevel === undefined && adjustedMean > 0) {
    freezingLevel =
      stationElevation + (adjustedMean / LAPSE_RATE_PER_1000M) * 1000;
  }

  // --- Re-parse through the schema to restore branded types ---
  const raw: Record<string, unknown> = {
    stationId: w.stationId,
    date: w.date,
    precipitation: adjustedPrecipitation,
    snowfall: adjustedSnowfall,
    snowDepth: w.snowDepth,
    temperature: {
      min: adjustedMin,
      max: adjustedMax,
      mean: adjustedMean,
    },
  };

  if (w.soilMoisture !== undefined) raw.soilMoisture = w.soilMoisture;
  if (w.wind !== undefined) raw.wind = w.wind;
  if (w.solarRadiation !== undefined) raw.solarRadiation = w.solarRadiation;
  if (freezingLevel !== undefined) raw.freezingLevel = freezingLevel;

  return WeatherWindowSchema.parse(raw);
}
