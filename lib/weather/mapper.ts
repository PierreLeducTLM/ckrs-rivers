import {
  WeatherWindowSchema,
  type WeatherWindow,
} from "@/lib/domain/weather-window";
import type { OpenMeteoResponse, OpenMeteoHourly } from "./response-schemas";

export type MapResult = {
  windows: WeatherWindow[];
  skippedDates: string[];
};

/**
 * Conversion factor: MJ/m² (daily total) → average W/m² over 24 h.
 *
 *   1 MJ = 1 000 000 J
 *   1 day = 86 400 s
 *   W/m² = MJ/m² × 1 000 000 / 86 400
 */
const MJ_PER_M2_TO_W_PER_M2 = 1_000_000 / 86_400;

/**
 * Open-Meteo returns wind speed in km/h. The domain uses m/s.
 */
const KMH_TO_MS = 1 / 3.6;

// ---------------------------------------------------------------------------
// Hourly → Daily aggregation
// ---------------------------------------------------------------------------

type DailyAggregates = Map<
  string,
  {
    snowDepthMax: number | null;
    sm0Values: number[];
    sm7Values: number[];
    sm28Values: number[];
  }
>;

/**
 * Aggregate hourly arrays (snow_depth, soil_moisture) into daily values.
 * snow_depth → max per day, soil_moisture → mean per day.
 */
function aggregateHourlyToDaily(hourly: OpenMeteoHourly): DailyAggregates {
  const byDate: DailyAggregates = new Map();

  for (let i = 0; i < hourly.time.length; i++) {
    // Hourly time is "YYYY-MM-DDTHH:MM" — extract the date part
    const date = hourly.time[i].slice(0, 10);

    if (!byDate.has(date)) {
      byDate.set(date, {
        snowDepthMax: null,
        sm0Values: [],
        sm7Values: [],
        sm28Values: [],
      });
    }
    const agg = byDate.get(date)!;

    const sd = hourly.snow_depth?.[i] ?? null;
    if (sd !== null) {
      agg.snowDepthMax = agg.snowDepthMax === null ? sd : Math.max(agg.snowDepthMax, sd);
    }

    const sm0 = hourly.soil_moisture_0_to_7cm?.[i] ?? null;
    if (sm0 !== null) agg.sm0Values.push(sm0);

    const sm7 = hourly.soil_moisture_7_to_28cm?.[i] ?? null;
    if (sm7 !== null) agg.sm7Values.push(sm7);

    const sm28 = hourly.soil_moisture_28_to_100cm?.[i] ?? null;
    if (sm28 !== null) agg.sm28Values.push(sm28);
  }

  return byDate;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// ---------------------------------------------------------------------------
// Main mapper
// ---------------------------------------------------------------------------

/**
 * Maps a raw Open-Meteo API response into validated domain `WeatherWindow[]`
 * objects. Days that cannot be fully mapped (missing required temperature data
 * or failing schema validation) are collected in `skippedDates`.
 */
export function mapResponseToWeatherWindows(
  response: OpenMeteoResponse,
  stationId: string,
): MapResult {
  const windows: WeatherWindow[] = [];
  const skippedDates: string[] = [];
  const { daily } = response;

  // Aggregate hourly data (snow_depth, soil_moisture) to daily if present
  const hourlyAgg = response.hourly
    ? aggregateHourlyToDaily(response.hourly)
    : new Map();

  for (let i = 0; i < daily.time.length; i++) {
    const date = daily.time[i];

    // --- Temperature (required) ---
    const rawMin = daily.temperature_2m_min[i];
    const rawMax = daily.temperature_2m_max[i];
    let rawMean = daily.temperature_2m_mean[i];

    if (rawMin === null || rawMax === null) {
      skippedDates.push(date);
      continue;
    }

    if (rawMean === null) {
      rawMean = (rawMin + rawMax) / 2;
    }

    // --- Precipitation (default 0) ---
    const precipitation = daily.precipitation_sum[i] ?? 0;

    // --- Snowfall (default 0) ---
    const snowfall = daily.snowfall_sum[i] ?? 0;

    // --- Snow depth from hourly aggregation (default 0) ---
    const dayAgg = hourlyAgg.get(date);
    const snowDepth = dayAgg?.snowDepthMax ?? 0;

    // --- Soil moisture from hourly aggregation (optional) ---
    const sm0 = dayAgg ? mean(dayAgg.sm0Values) : null;
    const sm7 = dayAgg ? mean(dayAgg.sm7Values) : null;
    const sm28 = dayAgg ? mean(dayAgg.sm28Values) : null;
    const hasSoilMoisture = sm0 !== null || sm7 !== null || sm28 !== null;

    const soilMoisture = hasSoilMoisture
      ? {
          ...(sm0 !== null && { depth0to7cm: sm0 }),
          ...(sm7 !== null && { depth7to28cm: sm7 }),
          ...(sm28 !== null && { depth28to100cm: sm28 }),
        }
      : undefined;

    // --- Wind (optional) ---
    const rawWindSpeed = daily.wind_speed_10m_max?.[i] ?? null;
    const wind =
      rawWindSpeed !== null ? { speed: rawWindSpeed * KMH_TO_MS } : undefined;

    // --- Solar radiation (optional) ---
    const rawRadiation = daily.shortwave_radiation_sum?.[i] ?? null;
    const solarRadiation =
      rawRadiation !== null
        ? rawRadiation * MJ_PER_M2_TO_W_PER_M2
        : undefined;

    // --- Assemble raw object and validate through Zod ---
    const raw = {
      stationId,
      date,
      temperature: { min: rawMin, max: rawMax, mean: rawMean },
      precipitation,
      snowfall,
      snowDepth,
      ...(soilMoisture !== undefined && { soilMoisture }),
      ...(wind !== undefined && { wind }),
      ...(solarRadiation !== undefined && { solarRadiation }),
    };

    try {
      const validated = WeatherWindowSchema.parse(raw);
      windows.push(validated);
    } catch {
      skippedDates.push(date);
    }
  }

  return { windows, skippedDates };
}
