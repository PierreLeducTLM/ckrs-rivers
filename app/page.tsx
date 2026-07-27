export const dynamic = "force-dynamic";

import { getStations, getPaddlingLevels, type PaddlingLevels } from "@/lib/data/rivers";
import { sql } from "@/lib/db/client";
import { getPaddlingStatus, statusColor } from "@/lib/notifications/paddling-status";
import { computeTrend } from "@/lib/notifications/evaluate";
import { getFeatureFlagState } from "@/lib/feature-flags";
import { AdminAddStation } from "./admin-wrapper";
import { TabProvider } from "./components/tab-context";
import AppShell from "./components/app-shell";
import type { StationCard } from "./components/types";

interface HourlyPoint {
  timestamp: string;
  observed: number | null;
  cehqForecast: number | null;
  cehqLow: number | null;
  cehqHigh: number | null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function Home() {
  const [stations, paddlingMap, chatFlagState] = await Promise.all([
    getStations(),
    getPaddlingLevels(),
    getFeatureFlagState("chat"),
  ]);

  // Fetch municipality for each station (not in domain model but in DB)
  const municipalityRows = (await sql(
    `SELECT id, municipality FROM stations`,
  )) as Array<{ id: string; municipality: string | null }>;
  const municipalityMap = new Map(municipalityRows.map((r) => [r.id, r.municipality]));

  const rows = await sql(
    `SELECT
       station_id,
       generated_at::text as forecast_at,
       (forecast_json->'lastFlow'->>'flow')::double precision as last_flow,
       forecast_json->'lastFlow'->>'date' as last_date,
       hourly_json,
       weather_json
     FROM forecast_cache`,
  ) as Array<{
    station_id: string;
    forecast_at: string | null;
    last_flow: number | null;
    last_date: string | null;
    hourly_json: HourlyPoint[] | null;
    weather_json: Array<{
      date: string;
      tempMin?: number;
      tempMax?: number;
      precipitation?: number;
      snowfall?: number;
    }> | null;
  }>;
  const dataMap = new Map(rows.map((r) => [r.station_id, r]));

  // Latest camera reading per station. Camera-based rivers have no CEHQ flow,
  // so their level comes from the most recent AI reading of a linked camera.
  // Thresholds and the value are in the camera scale's own units.
  const cameraRows = (await sql(
    `SELECT DISTINCT ON (c.station_id)
       c.station_id,
       ci.reading_value,
       c.scale_unit,
       c.paddling_min_reading,
       c.paddling_ideal_reading,
       c.paddling_max_reading
     FROM cameras c
     JOIN camera_images ci ON ci.camera_id = c.id
     WHERE c.active = true
       AND c.station_id IS NOT NULL
       AND ci.reading_value IS NOT NULL
     ORDER BY c.station_id, ci.captured_at DESC`,
  )) as Array<{
    station_id: string;
    reading_value: number;
    scale_unit: string | null;
    paddling_min_reading: number | null;
    paddling_ideal_reading: number | null;
    paddling_max_reading: number | null;
  }>;
  const cameraMap = new Map(cameraRows.map((r) => [r.station_id, r]));

  const nowTs = Date.now();
  const cutoffTs = nowTs - 2 * 24 * 60 * 60 * 1000;
  const todayStr = new Date().toISOString().slice(0, 10);

  // Pre-compute all card data on the server
  const cards: StationCard[] = stations.map((station) => {
    const data = dataMap.get(station.id);
    const paddling = paddlingMap.get(station.id);

    // Prefer the CEHQ flow. When a station has none (camera-based river),
    // fall back to its latest camera reading and the camera's reading-unit
    // thresholds so the card colours and sorts like every other river.
    const cehqFlow = data?.last_flow ?? null;
    const camera = cehqFlow == null ? cameraMap.get(station.id) : undefined;
    const isReading = camera != null;

    const value = isReading ? camera.reading_value : cehqFlow;
    const effectivePaddling: PaddlingLevels | undefined = isReading
      ? {
          min: camera.paddling_min_reading ?? undefined,
          ideal: camera.paddling_ideal_reading ?? undefined,
          max: camera.paddling_max_reading ?? undefined,
        }
      : paddling;
    const flowUnit = isReading ? (camera.scale_unit ?? "") : "m³/s";

    const { status, position } = getPaddlingStatus(value, effectivePaddling);
    const color = status === "too-low" ? "#a1a1aa"
      : status === "too-high" ? "#D32F2F"
      : status === "unknown" ? "#a1a1aa"
      : statusColor(position);
    const isGoodRange = status === "ideal" || status === "runnable";

    const sparkData = (data?.hourly_json ?? [])
      .map((p) => {
        const ts = new Date(p.timestamp).getTime();
        return {
          ts,
          observed: p.observed,
          cehqForecast: p.cehqForecast,
          cehqRange:
            p.cehqLow != null && p.cehqHigh != null
              ? ([p.cehqLow, p.cehqHigh] as [number, number])
              : undefined,
        };
      })
      .filter((p) => p.ts >= cutoffTs);

    const trend = computeTrend(data?.hourly_json ?? [], nowTs);

    const weatherDays = (data?.weather_json ?? [])
      .filter((w) => w.date >= todayStr)
      .slice(0, 7)
      .map((w) => ({
        date: w.date,
        tempMin: w.tempMin ?? null,
        tempMax: w.tempMax ?? null,
        precipitation: w.precipitation ?? 0,
        snowfall: w.snowfall ?? 0,
      }));

    return {
      id: station.id,
      name: station.name,
      lat: Number(station.coordinates.lat),
      lon: Number(station.coordinates.lon),
      municipality: municipalityMap.get(station.id) ?? undefined,
      catchmentArea: station.catchmentArea as number | undefined,
      lastFlow: value,
      flowUnit,
      isReading,
      forecastAt: data?.forecast_at ?? null,
      sparkData,
      nowTs,
      paddling: effectivePaddling
        ? {
            min: effectivePaddling.min,
            ideal: effectivePaddling.ideal,
            max: effectivePaddling.max,
          }
        : null,
      status,
      position,
      color,
      isGoodRange,
      trend,
      weatherDays,
      putIn: station.putIn
        ? [Number(station.putIn.lat), Number(station.putIn.lon)] as [number, number]
        : undefined,
      takeOut: station.takeOut
        ? [Number(station.takeOut.lat), Number(station.takeOut.lon)] as [number, number]
        : undefined,
      riverPath: station.riverPath,
      rapidClass: station.rapidClass as string | undefined,
      approved: station.approved ?? false,
      hidden: station.hidden ?? false,
    };
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-6xl px-6 py-4">
        <TabProvider>
          <AppShell cards={cards} chatFlagState={chatFlagState} />
        </TabProvider>

        <AdminAddStation />

        {stations.length === 0 && (
          <p className="py-20 text-center text-foreground/40">
            No stations found.
          </p>
        )}
      </main>
    </div>
  );
}
