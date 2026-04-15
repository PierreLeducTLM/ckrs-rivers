/**
 * Compact river catalog used to ground the chat LLM.
 *
 * Every request injects this into the system prompt so the model can
 * match natural-language queries to real stations without inventing names.
 * Kept lightweight (≈100 bytes/row) — detailed forecasts live behind tools.
 */

import { sql } from "@/lib/db/client";
import { getPaddlingStatus } from "@/lib/notifications/paddling-status";
import type { PaddlingStatus } from "@/lib/domain/notification";

export interface CatalogEntry {
  /** Internal station id (used when calling tools) */
  id: string;
  /** Display name */
  name: string;
  /** Municipality / region, when known */
  municipality: string | null;
  /** Coordinates (station point, not put-in) */
  lat: number;
  lon: number;
  /** Whitewater class string (e.g. "III-IV"), when known */
  rapidClass: string | null;
  /** Most recent observed flow (m³/s), when available */
  currentFlow: number | null;
  /** Paddling status derived from currentFlow + thresholds */
  paddlingStatus: PaddlingStatus;
  /** Paddling thresholds so the LLM can explain them if asked */
  paddling: { min?: number; ideal?: number; max?: number } | null;
}

interface CatalogRow {
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

function toNum(v: number | string | null | undefined): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Build the catalog fresh for each request.
 *
 * One SQL query joining stations with forecast_cache to keep latency low
 * even at 228+ stations.
 */
export async function buildRiverCatalog(): Promise<CatalogEntry[]> {
  const rows = (await sql(
    `SELECT
       s.id,
       s.name,
       s.municipality,
       s.lat,
       s.lon,
       s.rapid_class,
       s.paddling_min,
       s.paddling_ideal,
       s.paddling_max,
       fc.forecast_json->'lastFlow'->>'flow' AS last_flow
     FROM stations s
     LEFT JOIN forecast_cache fc ON fc.station_id = s.id
     WHERE s.status NOT IN ('error', 'test', 'info')
     ORDER BY s.name`,
  )) as CatalogRow[];

  return rows.map((r) => {
    const paddling = {
      min: toNum(r.paddling_min),
      ideal: toNum(r.paddling_ideal),
      max: toNum(r.paddling_max),
    };
    const hasThresholds =
      paddling.min != null || paddling.ideal != null || paddling.max != null;
    const currentFlow = r.last_flow != null ? parseFloat(r.last_flow) : null;
    const { status } = getPaddlingStatus(currentFlow, hasThresholds ? paddling : undefined);

    return {
      id: r.id,
      name: r.name,
      municipality: r.municipality,
      lat: Number(r.lat),
      lon: Number(r.lon),
      rapidClass: r.rapid_class,
      currentFlow,
      paddlingStatus: status,
      paddling: hasThresholds ? paddling : null,
    };
  });
}

/**
 * Serialize the catalog as a compact JSON string suitable for system-prompt
 * embedding. Coordinates rounded to 4 decimals (~10m), flows to 1 decimal —
 * a few KB saved × cache re-reads adds up.
 */
export function serializeCatalog(entries: CatalogEntry[]): string {
  const compact = entries.map((e) => ({
    id: e.id,
    name: e.name,
    municipality: e.municipality,
    lat: Math.round(e.lat * 10000) / 10000,
    lon: Math.round(e.lon * 10000) / 10000,
    rapidClass: e.rapidClass,
    currentFlow: e.currentFlow != null ? Math.round(e.currentFlow * 10) / 10 : null,
    paddlingStatus: e.paddlingStatus,
    paddling: e.paddling,
  }));
  return JSON.stringify(compact);
}
