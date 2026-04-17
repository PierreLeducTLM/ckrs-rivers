/**
 * Tools exposed to the chat LLM.
 *
 * Each tool wraps existing helpers in lib/notifications, lib/data, and
 * lib/forecast-correction so the chat answer is grounded in the same
 * bias-corrected forecast pipeline the rest of the app uses.
 */

import { tool } from "ai";
import { z } from "zod";

import { sql } from "@/lib/db/client";
import { getPaddlingLevels, type PaddlingLevels } from "@/lib/data/rivers";
import { haversineKm } from "@/lib/geo/haversine";
import { getPaddlingStatus } from "@/lib/notifications/paddling-status";
import {
  computeSnapshot,
  type StationForecastData,
  type ForecastDay,
  type HourlyPoint,
  type WeatherDay,
} from "@/lib/notifications/evaluate";
import {
  applyForecastCorrection,
  buildForecastCorrection,
} from "@/lib/forecast-correction";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface ForecastCacheRow {
  station_id: string;
  station_name: string;
  regime: string | null;
  forecast_json: {
    lastFlow: { date: string; flow: number } | null;
    forecastDays: Array<{ date: string; flow: number; flowLow?: number; flowHigh?: number }>;
  } | null;
  hourly_json: Array<{
    timestamp: string;
    observed?: number | null;
    cehqForecast?: number | null;
  }> | null;
  weather_json: Array<{
    date: string;
    precipitation?: number;
    snowfall?: number;
    snowDepth?: number;
  }> | null;
}

async function loadForecastData(stationId: string): Promise<StationForecastData | null> {
  const rows = (await sql(
    `SELECT
       s.id AS station_id,
       s.name AS station_name,
       s.regime,
       fc.forecast_json,
       fc.hourly_json,
       fc.weather_json
     FROM stations s
     LEFT JOIN forecast_cache fc ON fc.station_id = s.id
     WHERE s.id = $1`,
    [stationId],
  )) as ForecastCacheRow[];

  if (rows.length === 0) return null;
  const row = rows[0];

  const forecastDays: ForecastDay[] = (row.forecast_json?.forecastDays ?? []).map((d) => ({
    date: d.date,
    flow: d.flow,
    flowLow: d.flowLow,
    flowHigh: d.flowHigh,
  }));

  const hourlyData: HourlyPoint[] = (row.hourly_json ?? []).map((h) => ({
    timestamp: h.timestamp,
    observed: h.observed ?? null,
    cehqForecast: h.cehqForecast ?? null,
  }));

  const weatherDays: WeatherDay[] = (row.weather_json ?? []).map((w) => ({
    date: w.date,
    precipitation: w.precipitation,
    snowfall: w.snowfall,
    snowDepth: w.snowDepth,
  }));

  return {
    stationId: row.station_id,
    stationName: row.station_name,
    regime: row.regime ?? undefined,
    lastFlow: row.forecast_json?.lastFlow ?? null,
    forecastDays,
    hourlyData,
    weatherDays,
  };
}

/**
 * Enrich each forecast day with a paddling status using the same bias
 * correction the chart and status pills use.
 */
function enrichForecastDays(
  data: StationForecastData,
  paddling: PaddlingLevels | undefined,
  now: Date,
) {
  const correction = buildForecastCorrection(
    data.hourlyData.map((p) => ({
      ts: new Date(p.timestamp).getTime(),
      observed: p.observed,
      cehqForecast: p.cehqForecast,
    })),
    now.getTime(),
  );

  return data.forecastDays.map((day) => {
    const midpointMs = new Date(`${day.date}T12:00:00Z`).getTime();
    const hoursAhead = (midpointMs - now.getTime()) / 3_600_000;
    const corrected = applyForecastCorrection(day.flow, hoursAhead, correction);
    const { status } = getPaddlingStatus(corrected, paddling);
    return {
      date: day.date,
      flow: Math.round(corrected * 10) / 10,
      flowLow: day.flowLow != null ? Math.round(day.flowLow * 10) / 10 : undefined,
      flowHigh: day.flowHigh != null ? Math.round(day.flowHigh * 10) / 10 : undefined,
      paddlingStatus: status,
    };
  });
}

function round1(n: number | null): number | null {
  return n == null ? null : Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Tool: getStationForecast
// ---------------------------------------------------------------------------

const getStationForecast = tool({
  description:
    "Get the current flow, trend, and multi-day forecast for a single river station. " +
    "Call this whenever you need to predict whether a specific river will be good to " +
    "paddle on a given day. Input is the internal station id from the catalog.",
  inputSchema: z.object({
    stationId: z
      .string()
      .describe("The internal station id from the river catalog (e.g. '050304')"),
  }),
  execute: async ({ stationId }) => {
    try {
      const data = await loadForecastData(stationId);
      if (!data) return { error: `Station ${stationId} not found.` };

      const paddlingLevels = await getPaddlingLevels();
      const paddling = paddlingLevels.get(stationId);
      const now = new Date();
      const snapshot = computeSnapshot(data, paddling, now);
      const forecastDays = enrichForecastDays(data, paddling, now);

      return {
        id: data.stationId,
        name: data.stationName,
        regime: data.regime ?? null,
        paddling: paddling
          ? { min: paddling.min, ideal: paddling.ideal, max: paddling.max }
          : null,
        currentFlow: round1(snapshot.currentFlow),
        paddlingStatus: snapshot.paddlingStatus,
        trendDirection: snapshot.trendDirection,
        runnableWindowDays: snapshot.runnableWindowDays,
        forecastEntersRange: snapshot.forecastEntersRange,
        forecastEntersRangeInDays: snapshot.forecastEntersRangeInDays,
        forecastExitsRange: snapshot.forecastExitsRange,
        forecastExitsRangeInHours:
          snapshot.forecastExitsRangeInHours != null
            ? Math.round(snapshot.forecastExitsRangeInHours)
            : null,
        precipNext48hMm: Math.round(snapshot.precipNext48h),
        confidenceLevel: snapshot.confidenceLevel,
        forecastDays,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Failed to load forecast",
      };
    }
  },
});

// ---------------------------------------------------------------------------
// Tool: getStationsNearLocation
// ---------------------------------------------------------------------------

interface NearRow {
  id: string;
  name: string;
  municipality: string | null;
  lat: number | string;
  lon: number | string;
  rapid_class: string | null;
  paddling_min: number | string | null;
  paddling_ideal: number | string | null;
  paddling_max: number | string | null;
  last_flow: string | null;
}

const getStationsNearLocation = tool({
  description:
    "Find rivers near a geographic point, sorted by distance. Use this when the user " +
    "asks about rivers 'near me', near a specific city, or within a drive time (treat " +
    "1 hour of driving as ~80 km). Returns current flow and paddling status so you can " +
    "filter. If the user asks to find runnable rivers, call getStationForecast on the " +
    "top few to check upcoming days.",
  inputSchema: z.object({
    lat: z.number().describe("Latitude in decimal degrees"),
    lon: z.number().describe("Longitude in decimal degrees"),
    radiusKm: z
      .number()
      .positive()
      .max(500)
      .optional()
      .describe("Maximum distance in km (default 100)"),
    limit: z
      .number()
      .int()
      .positive()
      .max(30)
      .optional()
      .describe("Maximum number of results (default 15)"),
  }),
  execute: async ({ lat, lon, radiusKm = 100, limit = 15 }) => {
    try {
      const rows = (await sql(
        `SELECT
           s.id, s.name, s.municipality, s.lat, s.lon, s.rapid_class,
           s.paddling_min, s.paddling_ideal, s.paddling_max,
           fc.forecast_json->'lastFlow'->>'flow' AS last_flow
         FROM stations s
         LEFT JOIN forecast_cache fc ON fc.station_id = s.id
         WHERE s.status NOT IN ('error', 'test', 'info')`,
      )) as NearRow[];

      const scored = rows
        .map((r) => {
          const sLat = Number(r.lat);
          const sLon = Number(r.lon);
          const distance = haversineKm(lat, lon, sLat, sLon);
          return { row: r, distance, sLat, sLon };
        })
        .filter((x) => x.distance <= radiusKm)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit);

      return scored.map(({ row, distance }) => {
        const paddling: PaddlingLevels = {
          min: row.paddling_min != null ? Number(row.paddling_min) : undefined,
          ideal: row.paddling_ideal != null ? Number(row.paddling_ideal) : undefined,
          max: row.paddling_max != null ? Number(row.paddling_max) : undefined,
        };
        const hasThresholds =
          paddling.min != null || paddling.ideal != null || paddling.max != null;
        const currentFlow = row.last_flow != null ? parseFloat(row.last_flow) : null;
        const { status } = getPaddlingStatus(
          currentFlow,
          hasThresholds ? paddling : undefined,
        );

        return {
          id: row.id,
          name: row.name,
          municipality: row.municipality,
          distanceKm: Math.round(distance * 10) / 10,
          rapidClass: row.rapid_class,
          currentFlow: round1(currentFlow),
          paddlingStatus: status,
          paddling: hasThresholds ? paddling : null,
        };
      });
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Failed to find stations",
      };
    }
  },
});

// ---------------------------------------------------------------------------
// Tool: getFavoriteStationsStatus
// ---------------------------------------------------------------------------

const getFavoriteStationsStatus = tool({
  description:
    "Get the current status and best upcoming day for a list of station ids — use " +
    "when the user asks about their favorites. The user's favorite ids are provided " +
    "in the system prompt.",
  inputSchema: z.object({
    stationIds: z
      .array(z.string())
      .min(1)
      .describe("List of internal station ids (from the catalog)"),
  }),
  execute: async ({ stationIds }) => {
    try {
      const paddlingLevels = await getPaddlingLevels();
      const now = new Date();

      const results = await Promise.all(
        stationIds.map(async (id) => {
          const data = await loadForecastData(id);
          if (!data) return { id, error: "Not found" };

          const paddling = paddlingLevels.get(id);
          const snapshot = computeSnapshot(data, paddling, now);
          const days = enrichForecastDays(data, paddling, now);

          // Best upcoming day = highest preference for 'ideal', then 'runnable'
          const rank = (s: string) => {
            if (s === "ideal") return 0;
            if (s === "runnable") return 1;
            if (s === "too-high") return 2;
            if (s === "too-low") return 3;
            return 4;
          };
          let best: (typeof days)[number] | null = null;
          for (const d of days) {
            if (best == null || rank(d.paddlingStatus) < rank(best.paddlingStatus)) {
              best = d;
            }
          }

          return {
            id: data.stationId,
            name: data.stationName,
            paddling: paddling
              ? { min: paddling.min, ideal: paddling.ideal, max: paddling.max }
              : null,
            currentFlow: round1(snapshot.currentFlow),
            paddlingStatus: snapshot.paddlingStatus,
            trendDirection: snapshot.trendDirection,
            runnableWindowDays: snapshot.runnableWindowDays,
            bestUpcomingDay: best,
          };
        }),
      );

      return results;
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Failed to load favorites",
      };
    }
  },
});

// ---------------------------------------------------------------------------
// Tool: setUserLocation
// ---------------------------------------------------------------------------

const setUserLocation = tool({
  description:
    "Record the user's location when they tell you where they are (e.g. 'I'm in " +
    "Montreal', 'je suis a Quebec'). ONLY call this when the user has explicitly " +
    "stated their location in the current message AND the system prompt says their " +
    "browser location is not available. Provide the place name in the user's own " +
    "wording plus your best-known lat/lon for that place. The client uses the " +
    "returned values to update the chat header and to route subsequent 'near me' " +
    "queries. Do not call this tool to guess the user's location from unrelated " +
    "context.",
  inputSchema: z.object({
    label: z
      .string()
      .min(1)
      .describe("Short display label for the location, as the user referred to it (e.g. 'Montreal')"),
    lat: z.number().min(-90).max(90).describe("Latitude in decimal degrees"),
    lon: z.number().min(-180).max(180).describe("Longitude in decimal degrees"),
  }),
  execute: async ({ label, lat, lon }) => {
    return { label, lat, lon };
  },
});

// ---------------------------------------------------------------------------
// Export set
// ---------------------------------------------------------------------------

export const chatTools = {
  getStationForecast,
  getStationsNearLocation,
  getFavoriteStationsStatus,
  setUserLocation,
};
