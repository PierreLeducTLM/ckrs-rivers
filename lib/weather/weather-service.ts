import type { RiverStation } from "@/lib/domain/river-station";
import type { WeatherWindow } from "@/lib/domain/weather-window";
import { fetchHistoricalWeather, fetchForecastWeather } from "./open-meteo-client";
import { mapResponseToWeatherWindows } from "./mapper";
import { adjustForElevation } from "./elevation";
import { findCachedRange, writeCache, getCacheKey } from "./cache";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Deduplicate by date, keeping the last occurrence (freshest). */
function deduplicateByDate(windows: WeatherWindow[]): WeatherWindow[] {
  const map = new Map<string, WeatherWindow>();
  for (const w of windows) {
    map.set(w.date, w);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** Replace the stationId on all windows. */
function setStationId(
  windows: WeatherWindow[],
  stationId: string,
): WeatherWindow[] {
  return windows.map((w) => ({ ...w, stationId }) as WeatherWindow);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch historical weather for a river station, using the file cache to avoid
 * redundant API calls.
 *
 * Returns elevation-adjusted `WeatherWindow[]` sorted by date.
 */
export async function getHistoricalWeather(
  station: RiverStation,
  startDate: string,
  endDate: string,
): Promise<WeatherWindow[]> {
  const lat = station.coordinates.lat as number;
  const lon = station.coordinates.lon as number;

  // 1. Check cache
  const { cached, missingRanges } = await findCachedRange(
    lat,
    lon,
    startDate,
    endDate,
  );
  console.log(`[weather] Historical ${startDate}→${endDate}: ${cached.length} cached days, ${missingRanges.length} missing ranges`);

  // 2. Fetch missing ranges
  const fetched: WeatherWindow[] = [];

  for (const range of missingRanges) {
    console.log(`[weather]   Fetching from Open-Meteo archive: ${range.startDate}→${range.endDate}`);
    const response = await fetchHistoricalWeather({
      coordinates: station.coordinates,
      startDate: range.startDate,
      endDate: range.endDate,
    });

    const gridId = `grid_${lat}_${lon}`;
    const { windows } = mapResponseToWeatherWindows(response, gridId);

    // 3. Apply elevation adjustment
    const adjusted = adjustForElevation(
      windows,
      response.elevation,
      station.elevation as number | undefined,
    );

    // 4. Write to cache (raw grid data before stationId replacement)
    const cacheKey = getCacheKey(lat, lon, range.startDate, range.endDate);
    await writeCache(cacheKey, adjusted);

    fetched.push(...adjusted);
  }

  // 5. Merge, deduplicate, set station ID
  const merged = [...cached, ...fetched];
  const deduped = deduplicateByDate(merged);
  return setStationId(deduped, station.id);
}

/**
 * Fetch fresh forecast weather for a river station.
 *
 * Forecasts are never cached — they change with every model run.
 */
export async function getForecastWeather(
  station: RiverStation,
  forecastDays?: number,
): Promise<WeatherWindow[]> {
  console.log(`[weather] Fetching forecast from Open-Meteo: ${forecastDays ?? 16} days`);
  const t0 = Date.now();
  const response = await fetchForecastWeather({
    coordinates: station.coordinates,
    forecastDays,
  });

  const { windows } = mapResponseToWeatherWindows(response, station.id);
  console.log(`[weather] Forecast fetched: ${windows.length} days (${Date.now() - t0}ms)`);

  return adjustForElevation(
    windows,
    response.elevation,
    station.elevation as number | undefined,
  );
}

/**
 * Get a continuous weather timeline: historical data up to yesterday, forecast
 * from today onward.
 *
 * Overlapping days are resolved in favor of the forecast (fresher data).
 */
export async function getWeatherTimeline(
  station: RiverStation,
  historicalStartDate: string,
  forecastDays?: number,
): Promise<WeatherWindow[]> {
  const yesterday = yesterdayUTC();
  const today = todayUTC();

  // Only fetch historical if the start date is before today
  const historical =
    historicalStartDate < today
      ? await getHistoricalWeather(station, historicalStartDate, yesterday)
      : [];

  const forecast = await getForecastWeather(station, forecastDays);

  // Forecast wins on overlap (it comes second → deduplicateByDate keeps last)
  return deduplicateByDate([...historical, ...forecast]);
}
