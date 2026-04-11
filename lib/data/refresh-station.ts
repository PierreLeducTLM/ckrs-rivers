/**
 * Core station refresh logic — shared between API route and Trigger.dev task.
 *
 * Fetches CEHQ real-time + forecast + weather data for a station
 * and caches everything in the forecast_cache table.
 */

import { sql } from "@/lib/db/client";
import { getStationById, getRealtimeData } from "@/lib/data/rivers";
import { getWeatherTimeline } from "@/lib/weather/weather-service";
import { fetchCehqForecast } from "@/lib/realtime/cehq-forecast";
import { observedToHourly } from "@/lib/realtime/diurnal-profile";

export interface RefreshResult {
  stationId: string;
  success: boolean;
  generatedAt?: string;
  error?: string;
}

export async function refreshStation(stationId: string): Promise<RefreshResult> {
  const station = await getStationById(stationId);
  if (!station) {
    return { stationId, success: false, error: "Station not found" };
  }

  const cehqNumber = station.stationNumber;

  try {
    // -------------------------------------------------------------------
    // Custom river (no CEHQ station) — weather-only refresh
    // -------------------------------------------------------------------
    if (!cehqNumber) {
      const weatherStation = station.weatherCoordinates
        ? { ...station, coordinates: station.weatherCoordinates }
        : station;

      const lookbackDate = new Date();
      lookbackDate.setUTCDate(lookbackDate.getUTCDate() - 3);
      const lookback = lookbackDate.toISOString().slice(0, 10);

      let weatherSummary: Array<{
        date: string;
        tempMin: number;
        tempMax: number;
        tempMean: number;
        precipitation: number;
        snowfall: number;
        snowDepth: number;
      }> = [];

      try {
        const weather = await getWeatherTimeline(weatherStation, lookback, 10);
        weatherSummary = weather
          .filter((w) => w.date >= lookback)
          .map((w) => ({
            date: w.date,
            tempMin: Number(w.temperature.min),
            tempMax: Number(w.temperature.max),
            tempMean: Number(w.temperature.mean),
            precipitation: Number(w.precipitation),
            snowfall: Number(w.snowfall),
            snowDepth: Number(w.snowDepth),
          }));
      } catch {
        // Weather fetch failed
      }

      const cacheData = { lastFlow: null, forecastDays: [] };

      await sql(
        `INSERT INTO forecast_cache (station_id, forecast_json, hourly_json, weather_json, generated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (station_id) DO UPDATE SET
           forecast_json = EXCLUDED.forecast_json,
           hourly_json = EXCLUDED.hourly_json,
           weather_json = EXCLUDED.weather_json,
           generated_at = now()`,
        [stationId, JSON.stringify(cacheData), JSON.stringify([]), JSON.stringify(weatherSummary)],
      );

      return { stationId, success: true, generatedAt: new Date().toISOString() };
    }

    // -------------------------------------------------------------------
    // CEHQ station — full refresh (real-time + forecast + weather)
    // -------------------------------------------------------------------

    // 1. Fetch CEHQ real-time readings
    const realtimeData = await getRealtimeData(cehqNumber);
    const observedHourly = observedToHourly(realtimeData.readings);

    // Last observed flow
    const lastDailyAvg = realtimeData.dailyAverages.size > 0
      ? [...realtimeData.dailyAverages.entries()].sort(([a], [b]) => b.localeCompare(a))[0]
      : null;

    // 2. Fetch CEHQ official forecast
    let cehqPoints: Array<{ timestamp: string; flow: number; flowLow: number; flowHigh: number }> = [];
    try {
      const cehqForecast = await fetchCehqForecast(cehqNumber);
      cehqPoints = cehqForecast.points;
    } catch {
      // CEHQ forecast unavailable
    }

    // 3. Build hourly chart data (observed + CEHQ forecast)
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

    // 4. Fetch weather (use override coordinates if set)
    const weatherStation = station.weatherCoordinates
      ? { ...station, coordinates: station.weatherCoordinates }
      : station;

    const lookbackDate = new Date();
    lookbackDate.setUTCDate(lookbackDate.getUTCDate() - 3);
    const lookback = lookbackDate.toISOString().slice(0, 10);

    let weatherSummary: Array<{
      date: string;
      tempMin: number;
      tempMax: number;
      tempMean: number;
      precipitation: number;
      snowfall: number;
      snowDepth: number;
    }> = [];

    try {
      const weather = await getWeatherTimeline(weatherStation, lookback, 10);
      weatherSummary = weather
        .filter((w) => w.date >= lookback)
        .map((w) => ({
          date: w.date,
          tempMin: Number(w.temperature.min),
          tempMax: Number(w.temperature.max),
          tempMean: Number(w.temperature.mean),
          precipitation: Number(w.precipitation),
          snowfall: Number(w.snowfall),
          snowDepth: Number(w.snowDepth),
        }));
    } catch {
      // Weather fetch failed
    }

    // 5. Build forecast summary from CEHQ data (daily aggregates)
    const dailyForecast = new Map<string, { flows: number[]; lows: number[]; highs: number[] }>();
    for (const p of cehqPoints) {
      const date = p.timestamp.slice(0, 10);
      let entry = dailyForecast.get(date);
      if (!entry) {
        entry = { flows: [], lows: [], highs: [] };
        dailyForecast.set(date, entry);
      }
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

    // 6. Cache everything
    const cacheData = {
      lastFlow: lastDailyAvg ? { date: lastDailyAvg[0], flow: lastDailyAvg[1] } : null,
      forecastDays,
    };

    await sql(
      `INSERT INTO forecast_cache (station_id, forecast_json, hourly_json, weather_json, generated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (station_id) DO UPDATE SET
         forecast_json = EXCLUDED.forecast_json,
         hourly_json = EXCLUDED.hourly_json,
         weather_json = EXCLUDED.weather_json,
         generated_at = now()`,
      [stationId, JSON.stringify(cacheData), JSON.stringify(hourlyData), JSON.stringify(weatherSummary)],
    );

    return { stationId, success: true, generatedAt: new Date().toISOString() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refresh failed";
    return { stationId, success: false, error: message };
  }
}
