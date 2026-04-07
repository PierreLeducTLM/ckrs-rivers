export const dynamic = "force-dynamic";

import { getStations, getPaddlingLevels } from "@/lib/data/rivers";
import type { PaddlingLevels } from "@/lib/data/rivers";
import { sql } from "@/lib/db/client";
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
// Paddling helpers (server-only)
// ---------------------------------------------------------------------------

function getPaddlingStatus(
  flow: number | null | undefined,
  paddling: PaddlingLevels | undefined,
): { status: "unknown" | "too-low" | "runnable" | "ideal" | "too-high"; position: number } {
  if (flow == null || !paddling) return { status: "unknown", position: -1 };
  const { min, ideal, max } = paddling;
  if (min == null && ideal == null && max == null) return { status: "unknown", position: -1 };

  if (min != null && flow < min) return { status: "too-low", position: 0 };
  if (max != null && flow > max) return { status: "too-high", position: 1 };

  if (min != null && ideal != null && flow <= ideal) {
    const range = ideal - min;
    const pos = range > 0 ? ((flow - min) / range) * 0.5 : 0.25;
    return { status: "runnable", position: pos };
  }
  if (ideal != null && max != null && flow >= ideal) {
    const range = max - ideal;
    const pos = range > 0 ? 0.5 + ((flow - ideal) / range) * 0.5 : 0.75;
    return { status: "ideal", position: pos };
  }
  if (min != null && max != null) {
    const pos = (flow - min) / (max - min);
    return { status: "runnable", position: pos };
  }

  return { status: "runnable", position: 0.5 };
}

function statusColor(position: number): string {
  if (position < 0) return "";
  const p = Math.max(0, Math.min(1, position));
  if (p <= 0.5) {
    const t = p / 0.5;
    const r = Math.round(234 + (34 - 234) * t);
    const g = Math.round(179 + (197 - 179) * t);
    const b = Math.round(8 + (94 - 8) * t);
    return `rgb(${r},${g},${b})`;
  }
  const t = (p - 0.5) / 0.5;
  const r = Math.round(34 + (239 - 34) * t);
  const g = Math.round(197 + (68 - 197) * t);
  const b = Math.round(94 + (68 - 94) * t);
  return `rgb(${r},${g},${b})`;
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
       hourly_json
     FROM forecast_cache`,
  ) as Array<{
    station_id: string;
    forecast_at: string | null;
    last_flow: number | null;
    last_date: string | null;
    hourly_json: HourlyPoint[] | null;
  }>;
  const dataMap = new Map(rows.map((r) => [r.station_id, r]));

  const nowTs = Date.now();
  const cutoffTs = nowTs - 2 * 24 * 60 * 60 * 1000;

  // Pre-compute all card data on the server
  const cards: StationCard[] = stations.map((station) => {
    const data = dataMap.get(station.id);
    const paddling = paddlingMap.get(station.id);
    const { status, position } = getPaddlingStatus(data?.last_flow, paddling);
    const color = statusColor(position);
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

    return {
      id: station.id,
      name: station.name,
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
