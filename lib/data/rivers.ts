/**
 * Shared data layer — loads river stations from Neon PostgreSQL.
 * Real-time data fetched directly from CEHQ.
 */
import { cache } from "react";

import { sql } from "@/lib/db/client";
import {
  RiverStationSchema,
  type RiverStation,
  type Rapid,
} from "@/lib/domain/river-station";
import { fetchRealtimeData, type RealtimeResult } from "@/lib/realtime/cehq-client";

// ---------------------------------------------------------------------------
// Station types (DB row → domain)
// ---------------------------------------------------------------------------

interface StationRow {
  id: string;
  station_number: string | null;
  name: string;
  lat: number;
  lon: number;
  catchment_area_km2: number | null;
  regime: string | null;
  municipality: string | null;
  paddling_min: number | null;
  paddling_ideal: number | null;
  paddling_max: number | null;
  status: string;
  error_message: string | null;
  weather_city: string | null;
  weather_lat: number | null;
  weather_lon: number | null;
  put_in_lat: number | null;
  put_in_lon: number | null;
  take_out_lat: number | null;
  take_out_lon: number | null;
  river_path: [number, number][] | null;
  rapid_class: string | null;
  description: string | null;
  rapids: Rapid[] | null;
}

function rowToStation(row: StationRow): RiverStation {
  return RiverStationSchema.parse({
    id: row.id,
    stationNumber: row.station_number ?? undefined,
    name: row.name || `Station ${row.id}`,
    coordinates: { lat: row.lat, lon: row.lon },
    catchmentArea: row.catchment_area_km2 ?? undefined,
    regime: row.regime ?? undefined,
    weatherCity: row.weather_city ?? undefined,
    weatherCoordinates:
      row.weather_lat != null && row.weather_lon != null
        ? { lat: row.weather_lat, lon: row.weather_lon }
        : undefined,
    putIn:
      row.put_in_lat != null && row.put_in_lon != null
        ? { lat: row.put_in_lat, lon: row.put_in_lon }
        : undefined,
    takeOut:
      row.take_out_lat != null && row.take_out_lon != null
        ? { lat: row.take_out_lat, lon: row.take_out_lon }
        : undefined,
    riverPath: row.river_path ?? undefined,
    rapidClass: row.rapid_class ?? undefined,
    description: row.description ?? undefined,
    rapids: row.rapids ?? [],
  });
}

// ---------------------------------------------------------------------------
// Cached loaders (React.cache = one call per server request)
// ---------------------------------------------------------------------------

export const getStations = cache(async (): Promise<RiverStation[]> => {
  const rows = (await sql(
    `SELECT * FROM stations WHERE status != 'error' ORDER BY name`,
  )) as StationRow[];
  return rows.map(rowToStation);
});

export const getStationById = cache(
  async (id: string): Promise<RiverStation | undefined> => {
    const rows = (await sql(
      `SELECT * FROM stations WHERE id = $1`,
      [id],
    )) as StationRow[];
    if (rows.length === 0) return undefined;
    return rowToStation(rows[0]);
  },
);

// ---------------------------------------------------------------------------
// Paddling thresholds
// ---------------------------------------------------------------------------

export interface PaddlingLevels {
  min?: number;
  ideal?: number;
  max?: number;
}

export const getPaddlingLevels = cache(async (): Promise<Map<string, PaddlingLevels>> => {
  const rows = (await sql(
    `SELECT id, paddling_min, paddling_ideal, paddling_max FROM stations
     WHERE paddling_min IS NOT NULL OR paddling_ideal IS NOT NULL OR paddling_max IS NOT NULL`,
  )) as Array<{ id: string; paddling_min: number | null; paddling_ideal: number | null; paddling_max: number | null }>;

  const map = new Map<string, PaddlingLevels>();
  for (const r of rows) {
    map.set(r.id, {
      min: r.paddling_min ?? undefined,
      ideal: r.paddling_ideal ?? undefined,
      max: r.paddling_max ?? undefined,
    });
  }
  return map;
});

// ---------------------------------------------------------------------------
// Real-time data from CEHQ
// ---------------------------------------------------------------------------

export async function getRealtimeData(stationId: string): Promise<RealtimeResult> {
  return fetchRealtimeData(stationId);
}
