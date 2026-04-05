import type { Coordinates } from "@/lib/domain/units";
import {
  OpenMeteoResponseSchema,
  type OpenMeteoResponse,
} from "./response-schemas";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

export const DAILY_VARIABLES = [
  "precipitation_sum",
  "snowfall_sum",
  "temperature_2m_max",
  "temperature_2m_min",
  "temperature_2m_mean",
  "wind_speed_10m_max",
  "shortwave_radiation_sum",
] as const;

/** Variables only available at hourly resolution — aggregated to daily by the mapper. */
export const HOURLY_VARIABLES = [
  "snow_depth",
  "soil_moisture_0_to_7cm",
  "soil_moisture_7_to_28cm",
  "soil_moisture_28_to_100cm",
] as const;

const MIN_REQUEST_INTERVAL_MS = 300;
const MAX_RETRIES = 3;
const MAX_CHUNK_DAYS = 365;

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class WeatherFetchError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly endpoint: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "WeatherFetchError";
  }
}

// ---------------------------------------------------------------------------
// Rate limiter (module-level)
// ---------------------------------------------------------------------------

let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    const delay = MIN_REQUEST_INTERVAL_MS - elapsed;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  lastRequestTime = Date.now();
}

// ---------------------------------------------------------------------------
// Fetch with retry & validation
// ---------------------------------------------------------------------------

async function fetchWithRetry(url: string): Promise<OpenMeteoResponse> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await rateLimit();

    const response = await fetch(url);

    if (response.ok) {
      const json = await response.json();
      return OpenMeteoResponseSchema.parse(json);
    }

    const retryable = response.status === 429 || response.status >= 500;

    if (!retryable) {
      throw new WeatherFetchError(
        `Open-Meteo request failed: ${response.status} ${response.statusText}`,
        response.status,
        url,
        false,
      );
    }

    lastError = new WeatherFetchError(
      `Open-Meteo request failed: ${response.status} ${response.statusText}`,
      response.status,
      url,
      true,
    );

    // Exponential backoff: 1s, 2s, 4s
    const backoff = 1000 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, backoff));
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Return yesterday's date in UTC as "YYYY-MM-DD". */
function yesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Add `days` to an ISO date string and return the new ISO date string. */
function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Return the smaller of two ISO date strings. */
function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}

// ---------------------------------------------------------------------------
// Chunk helpers
// ---------------------------------------------------------------------------

interface DateChunk {
  startDate: string;
  endDate: string;
}

function splitIntoChunks(startDate: string, endDate: string): DateChunk[] {
  const chunks: DateChunk[] = [];
  let cursor = startDate;

  while (cursor <= endDate) {
    const chunkEnd = minDate(addDays(cursor, MAX_CHUNK_DAYS - 1), endDate);
    chunks.push({ startDate: cursor, endDate: chunkEnd });
    cursor = addDays(chunkEnd, 1);
  }

  return chunks;
}

function mergeArrayField(
  existing: (number | null)[] | undefined,
  incoming: (number | null)[] | undefined,
): (number | null)[] | undefined {
  if (existing && incoming) return [...existing, ...incoming];
  if (incoming) return [...incoming];
  return existing;
}

function mergeResponses(responses: OpenMeteoResponse[]): OpenMeteoResponse {
  if (responses.length === 1) return responses[0];

  const base = responses[0];
  const mergedDaily = { ...base.daily };
  const mergedHourly = base.hourly ? { ...base.hourly } : undefined;

  for (let r = 1; r < responses.length; r++) {
    const chunk = responses[r];

    // Merge daily arrays
    mergedDaily.time = [...mergedDaily.time, ...chunk.daily.time];
    for (const variable of DAILY_VARIABLES) {
      const key = variable as keyof typeof mergedDaily;
      (mergedDaily[key] as (number | null)[] | undefined) = mergeArrayField(
        mergedDaily[key] as (number | null)[] | undefined,
        chunk.daily[key] as (number | null)[] | undefined,
      );
    }

    // Merge hourly arrays
    if (mergedHourly && chunk.hourly) {
      mergedHourly.time = [...mergedHourly.time, ...chunk.hourly.time];
      for (const variable of HOURLY_VARIABLES) {
        const key = variable as keyof typeof mergedHourly;
        (mergedHourly[key] as (number | null)[] | undefined) = mergeArrayField(
          mergedHourly[key] as (number | null)[] | undefined,
          chunk.hourly[key] as (number | null)[] | undefined,
        );
      }
    }
  }

  return { ...base, daily: mergedDaily, hourly: mergedHourly };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchHistoricalWeather(params: {
  coordinates: Coordinates;
  startDate: string;
  endDate: string;
}): Promise<OpenMeteoResponse> {
  const { coordinates, startDate } = params;

  // Clamp endDate to yesterday UTC if it's today or in the future
  const yesterday = yesterdayUTC();
  const endDate = minDate(params.endDate, yesterday);

  if (startDate > endDate) {
    throw new WeatherFetchError(
      `Start date ${startDate} is after clamped end date ${endDate}`,
      400,
      ARCHIVE_URL,
      false,
    );
  }

  const chunks = splitIntoChunks(startDate, endDate);
  const dailyParam = DAILY_VARIABLES.join(",");
  const hourlyParam = HOURLY_VARIABLES.join(",");

  const responses: OpenMeteoResponse[] = [];

  for (const chunk of chunks) {
    const url = new URL(ARCHIVE_URL);
    url.searchParams.set("latitude", String(coordinates.lat));
    url.searchParams.set("longitude", String(coordinates.lon));
    url.searchParams.set("start_date", chunk.startDate);
    url.searchParams.set("end_date", chunk.endDate);
    url.searchParams.set("daily", dailyParam);
    url.searchParams.set("hourly", hourlyParam);
    url.searchParams.set("timezone", "UTC");

    responses.push(await fetchWithRetry(url.toString()));
  }

  return mergeResponses(responses);
}

export async function fetchForecastWeather(params: {
  coordinates: Coordinates;
  forecastDays?: number;
}): Promise<OpenMeteoResponse> {
  const { coordinates, forecastDays = 16 } = params;
  const dailyParam = DAILY_VARIABLES.join(",");
  const hourlyParam = HOURLY_VARIABLES.join(",");

  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", String(coordinates.lat));
  url.searchParams.set("longitude", String(coordinates.lon));
  url.searchParams.set("forecast_days", String(forecastDays));
  url.searchParams.set("daily", dailyParam);
  url.searchParams.set("hourly", hourlyParam);
  url.searchParams.set("timezone", "UTC");

  return fetchWithRetry(url.toString());
}
