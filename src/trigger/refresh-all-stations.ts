import { logger, schedules } from "@trigger.dev/sdk/v3";
import { neon } from "@neondatabase/serverless";

/**
 * Refresh all station data every 15 minutes.
 *
 * We inline the DB query + refresh logic here rather than importing from
 * @/lib because Trigger.dev tasks run in their own bundled environment
 * and path aliases may not resolve at runtime. The core fetch functions
 * (CEHQ, weather) use plain fetch() so they work anywhere.
 */

// ---------------------------------------------------------------------------
// DB helper (standalone — doesn't rely on @/ alias)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlFn = (query: string, params?: any[]) => Promise<any[]>;

function createSql(): SqlFn {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  const neonSql = neon(process.env.DATABASE_URL);
  return (query, params) => neonSql.query(query, params ?? []);
}

// ---------------------------------------------------------------------------
// CEHQ real-time data
// ---------------------------------------------------------------------------

interface RealtimeReading {
  date: string;
  time: string;
  timestamp: string;
  waterLevel: number | null;
  flow: number | null;
}

function parseFrenchNumber(raw: string): number | null {
  if (!raw || raw.trim() === "") return null;
  const cleaned = raw.replace(/\*/g, "").replace(",", ".").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

async function fetchRealtimeData(stationId: string) {
  const url = `https://www.cehq.gouv.qc.ca/suivihydro/fichier_donnees.asp?NoStation=${stationId}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`CEHQ fetch failed: ${response.status}`);

  const text = await response.text();
  const lines = text.split("\n");
  const readings: RealtimeReading[] = [];

  for (const line of lines) {
    const match = line.match(/^(\d{4}-\d{2}-\d{2})\t(\d{2}:\d{2})\t(.+)$/);
    if (!match) continue;
    const [, date, time, rest] = match;
    const parts = rest.split("\t").map((s) => s.trim());

    let waterLevel: number | null = null;
    let flow: number | null = null;

    if (parts.length >= 2) {
      waterLevel = parseFrenchNumber(parts[0]);
      flow = parseFrenchNumber(parts[parts.length - 1]);
    } else {
      flow = parseFrenchNumber(parts[0]);
    }

    if (flow === null) continue;
    readings.push({ date, time, timestamp: `${date}T${time}:00Z`, waterLevel, flow });
  }

  readings.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Daily averages
  const dailySums = new Map<string, { sum: number; count: number }>();
  for (const r of readings) {
    if (r.flow === null) continue;
    const entry = dailySums.get(r.date) ?? { sum: 0, count: 0 };
    entry.sum += r.flow;
    entry.count += 1;
    dailySums.set(r.date, entry);
  }
  const dailyAverages = new Map<string, number>();
  for (const [date, { sum, count }] of dailySums) {
    dailyAverages.set(date, sum / count);
  }

  return { readings, dailyAverages };
}

// ---------------------------------------------------------------------------
// CEHQ forecast
// ---------------------------------------------------------------------------

interface CehqForecastPoint {
  timestamp: string;
  flow: number;
  flowLow: number;
  flowHigh: number;
}

async function fetchCehqForecast(stationId: string): Promise<CehqForecastPoint[]> {
  const url = `https://www.cehq.gouv.qc.ca/depot/suivihydro/bd/JSON/${stationId}.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`CEHQ JSON failed: ${response.status}`);

  const data = (await response.json()) as { prevision?: Array<{ datePrevision: string; qMCS: number; q25MCS: number; q75MCS: number }> };
  return (data.prevision ?? [])
    .filter((p) => p.qMCS != null && p.q25MCS != null && p.q75MCS != null)
    .map((p) => ({
      timestamp: p.datePrevision.replace(" ", "T") + "Z",
      flow: p.qMCS,
      flowLow: p.q25MCS,
      flowHigh: p.q75MCS,
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// ---------------------------------------------------------------------------
// Observed → hourly aggregation
// ---------------------------------------------------------------------------

function observedToHourly(readings: RealtimeReading[]) {
  const byHour = new Map<string, { sum: number; count: number }>();
  for (const r of readings) {
    if (r.flow === null) continue;
    const hour = parseInt(r.time.slice(0, 2), 10);
    const key = `${r.date}T${String(hour).padStart(2, "0")}`;
    const entry = byHour.get(key) ?? { sum: 0, count: 0 };
    entry.sum += r.flow;
    entry.count += 1;
    byHour.set(key, entry);
  }

  return [...byHour.entries()]
    .map(([key, { sum, count }]) => ({
      timestamp: `${key}:00:00Z`,
      flow: sum / count,
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// ---------------------------------------------------------------------------
// Weather fetch (Open-Meteo)
// ---------------------------------------------------------------------------

async function fetchWeatherSummary(lat: number, lon: number, lookbackDays: number, forecastDays: number) {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - lookbackDays);

  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  // Historical
  const histUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,snowfall_sum,snow_depth&timezone=UTC`;
  // Forecast
  const fcstUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,snowfall_sum,snow_depth&forecast_days=${forecastDays}&timezone=UTC`;

  const results: Array<{
    date: string;
    tempMin: number;
    tempMax: number;
    tempMean: number;
    precipitation: number;
    snowfall: number;
    snowDepth: number;
  }> = [];

  const byDate = new Map<string, typeof results[0]>();

  for (const url of [histUrl, fcstUrl]) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = (await res.json()) as {
        daily?: {
          time?: string[];
          temperature_2m_max?: number[];
          temperature_2m_min?: number[];
          temperature_2m_mean?: number[];
          precipitation_sum?: number[];
          snowfall_sum?: number[];
          snow_depth?: number[];
        };
      };
      const d = data.daily;
      if (!d?.time) continue;
      for (let i = 0; i < d.time.length; i++) {
        byDate.set(d.time[i], {
          date: d.time[i],
          tempMin: d.temperature_2m_min?.[i] ?? 0,
          tempMax: d.temperature_2m_max?.[i] ?? 0,
          tempMean: d.temperature_2m_mean?.[i] ?? 0,
          precipitation: d.precipitation_sum?.[i] ?? 0,
          snowfall: d.snowfall_sum?.[i] ?? 0,
          snowDepth: d.snow_depth?.[i] ?? 0,
        });
      }
    } catch {
      // Weather source unavailable
    }
  }

  for (const entry of byDate.values()) results.push(entry);
  return results.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Refresh a single station
// ---------------------------------------------------------------------------

async function refreshStation(
  dbSql: SqlFn,
  stationId: string,
  lat: number,
  lon: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. CEHQ real-time
    const { readings, dailyAverages } = await fetchRealtimeData(stationId);
    const observedHourly = observedToHourly(readings);

    const lastDailyAvg = dailyAverages.size > 0
      ? [...dailyAverages.entries()].sort(([a], [b]) => b.localeCompare(a))[0]
      : null;

    // 2. CEHQ forecast
    let cehqPoints: CehqForecastPoint[] = [];
    try {
      cehqPoints = await fetchCehqForecast(stationId);
    } catch { /* unavailable */ }

    // 3. Merge into hourly chart data
    const hourlyByTs = new Map<string, Record<string, unknown>>();

    for (const p of observedHourly) {
      const label = new Date(p.timestamp).toLocaleString("en-CA", {
        month: "short", day: "numeric", hour: "2-digit", hour12: false, timeZone: "UTC",
      });
      hourlyByTs.set(p.timestamp, {
        timestamp: p.timestamp, label,
        observed: p.flow, cehqForecast: null, cehqLow: null, cehqHigh: null,
      });
    }

    for (const p of cehqPoints) {
      const tsHour = p.timestamp.slice(0, 13) + ":00:00Z";
      const label = new Date(tsHour).toLocaleString("en-CA", {
        month: "short", day: "numeric", hour: "2-digit", hour12: false, timeZone: "UTC",
      });
      const existing = hourlyByTs.get(tsHour);
      if (existing) {
        existing.cehqForecast = p.flow;
        existing.cehqLow = p.flowLow;
        existing.cehqHigh = p.flowHigh;
      } else {
        hourlyByTs.set(tsHour, {
          timestamp: tsHour, label,
          observed: null, cehqForecast: p.flow, cehqLow: p.flowLow, cehqHigh: p.flowHigh,
        });
      }
    }

    const hourlyData = [...hourlyByTs.values()].sort((a, b) =>
      (a as { timestamp: string }).timestamp.localeCompare((b as { timestamp: string }).timestamp),
    );

    // 4. Weather
    let weatherSummary: Awaited<ReturnType<typeof fetchWeatherSummary>> = [];
    try {
      weatherSummary = await fetchWeatherSummary(lat, lon, 3, 10);
    } catch { /* weather unavailable */ }

    // 5. Daily forecast aggregates
    const dailyForecast = new Map<string, { flows: number[]; lows: number[]; highs: number[] }>();
    for (const p of cehqPoints) {
      const date = p.timestamp.slice(0, 10);
      let entry = dailyForecast.get(date);
      if (!entry) { entry = { flows: [], lows: [], highs: [] }; dailyForecast.set(date, entry); }
      entry.flows.push(p.flow);
      entry.lows.push(p.flowLow);
      entry.highs.push(p.flowHigh);
    }

    const forecastDays = [...dailyForecast.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, entry]) => ({
        date,
        flow: entry.flows.reduce((a, b) => a + b, 0) / entry.flows.length,
        flowLow: Math.min(...entry.lows),
        flowHigh: Math.max(...entry.highs),
      }));

    // 6. Cache
    const cacheData = {
      lastFlow: lastDailyAvg ? { date: lastDailyAvg[0], flow: lastDailyAvg[1] } : null,
      forecastDays,
    };

    await dbSql(
      `INSERT INTO forecast_cache (station_id, forecast_json, hourly_json, weather_json, generated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (station_id) DO UPDATE SET
         forecast_json = EXCLUDED.forecast_json,
         hourly_json = EXCLUDED.hourly_json,
         weather_json = EXCLUDED.weather_json,
         generated_at = now()`,
      [stationId, JSON.stringify(cacheData), JSON.stringify(hourlyData), JSON.stringify(weatherSummary)],
    );

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// Scheduled task: refresh all stations every 15 minutes
// ---------------------------------------------------------------------------

export const refreshAllStations = schedules.task({
  id: "refresh-all-stations",
  cron: "*/15 * * * *",
  maxDuration: 300,
  run: async (payload) => {
    const dbSql = createSql();

    // Get all active stations
    const stations = (await dbSql(
      `SELECT id, lat, lon FROM stations WHERE status != 'error' ORDER BY id`,
    )) as Array<{ id: string; lat: number; lon: number }>;

    logger.info(`Refreshing ${stations.length} stations`, {
      scheduledAt: payload.timestamp.toISOString(),
    });

    const results: Array<{ stationId: string; success: boolean; error?: string }> = [];

    // Process stations sequentially to avoid overwhelming CEHQ / Open-Meteo
    for (const station of stations) {
      logger.info(`Refreshing station ${station.id}...`);
      const result = await refreshStation(dbSql, station.id, station.lat, station.lon);
      results.push({ stationId: station.id, ...result });

      if (result.success) {
        logger.info(`Station ${station.id} refreshed`);
      } else {
        logger.warn(`Station ${station.id} failed: ${result.error}`);
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    logger.info(`Refresh complete: ${succeeded} succeeded, ${failed} failed`, { results });

    return { total: stations.length, succeeded, failed, results };
  },
});
