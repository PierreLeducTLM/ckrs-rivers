export const dynamic = "force-dynamic";

import { getStations, getPaddlingLevels } from "@/lib/data/rivers";
import { sql } from "@/lib/db/client";
import { getPaddlingStatus, statusColor } from "@/lib/notifications/paddling-status";
import { AdminAddStation, AdminBadge } from "./admin-wrapper";
import StationGrid from "./station-grid";
import type { StationCard } from "./station-grid";

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
  const [stations, paddlingMap] = await Promise.all([getStations(), getPaddlingLevels()]);

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

  const nowTs = Date.now();
  const cutoffTs = nowTs - 2 * 24 * 60 * 60 * 1000;
  const todayStr = new Date().toISOString().slice(0, 10);

  // Pre-compute all card data on the server
  const cards: StationCard[] = stations.map((station) => {
    const data = dataMap.get(station.id);
    const paddling = paddlingMap.get(station.id);
    const { status, position } = getPaddlingStatus(data?.last_flow, paddling);
    const color = status === "too-low" ? "#3b82f6" : statusColor(position);
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

    // Extract upcoming weather days for card pictograms
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
      catchmentArea: station.catchmentArea as number | undefined,
      lastFlow: data?.last_flow ?? null,
      forecastAt: data?.forecast_at ?? null,
      sparkData,
      nowTs,
      paddling: paddling
        ? { min: paddling.min, ideal: paddling.ideal, max: paddling.max }
        : null,
      status,
      position,
      color,
      isGoodRange,
      weatherDays,
      putIn: station.putIn
        ? [Number(station.putIn.lat), Number(station.putIn.lon)] as [number, number]
        : undefined,
      takeOut: station.takeOut
        ? [Number(station.takeOut.lat), Number(station.takeOut.lon)] as [number, number]
        : undefined,
      riverPath: station.riverPath,
    };
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-foreground/10 px-6 py-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight inline-flex items-center">
          WaterFlow
          <AdminBadge />
        </h1>
        <p className="mt-2 text-lg text-foreground/60">
          Quebec River Flow Monitoring
        </p>
      </header>

      {/* River cards grid */}
      <main className="mx-auto max-w-6xl px-6 py-10">
        <StationGrid cards={cards} />

        <AdminAddStation />

        {stations.length === 0 && (
          <p className="py-20 text-center text-foreground/40">
            No stations found. Add a CEHQ station to get started.
          </p>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-foreground/10 px-6 py-6 text-center text-sm text-foreground/40">
        Data from CEHQ &amp; Open-Meteo
      </footer>
    </div>
  );
}
