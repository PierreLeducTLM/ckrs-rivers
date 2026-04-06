/**
 * Shared data layer — loads river stations, flow readings, and real-time data.
 * Used by both server components and API routes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cache } from "react";

import { RiverStationSchema, type RiverStation } from "@/lib/domain/river-station";
import { FlowReadingSchema, type FlowReading } from "@/lib/domain/flow-reading";
import type { TrainedModel } from "@/lib/model/types";
import { fetchRealtimeData, type RealtimeResult } from "@/lib/realtime/cehq-client";

const PARSED_DIR = join(process.cwd(), "datas", "parsed");
const MODEL_PATH = join(process.cwd(), "datas", "models", "flow-model.json");

// ---------------------------------------------------------------------------
// Cached loaders (React.cache = one call per server request)
// ---------------------------------------------------------------------------

export const getStations = cache((): RiverStation[] => {
  const raw = JSON.parse(readFileSync(join(PARSED_DIR, "stations.json"), "utf-8"));
  return (
    raw as Array<{
      id: string;
      name: string;
      catchmentArea: number | null;
      lat: number;
      lon: number;
    }>
  ).map((s) =>
    RiverStationSchema.parse({
      id: s.id,
      name: s.name,
      coordinates: { lat: s.lat, lon: s.lon },
      catchmentArea: s.catchmentArea ?? undefined,
    }),
  );
});

// ---------------------------------------------------------------------------
// Paddling thresholds
// ---------------------------------------------------------------------------

export interface PaddlingLevels {
  min?: number;
  ideal?: number;
  max?: number;
}

export const getPaddlingLevels = cache((): Map<string, PaddlingLevels> => {
  const raw = JSON.parse(readFileSync(join(PARSED_DIR, "stations.json"), "utf-8")) as Array<{
    id: string;
    paddling?: { min?: number; ideal?: number; max?: number };
  }>;
  const map = new Map<string, PaddlingLevels>();
  for (const s of raw) {
    if (s.paddling && (s.paddling.min !== undefined || s.paddling.ideal !== undefined || s.paddling.max !== undefined)) {
      map.set(s.id, s.paddling);
    }
  }
  return map;
});

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export const getModel = cache((): TrainedModel => {
  return JSON.parse(readFileSync(MODEL_PATH, "utf-8"));
});

export function getStationById(id: string): RiverStation | undefined {
  return getStations().find((s) => s.id === id);
}

// ---------------------------------------------------------------------------
// Real-time data from CEHQ
// ---------------------------------------------------------------------------

/**
 * Fetch real-time data from CEHQ. Returns ~7 days of 15-minute readings
 * with daily averages computed.
 */
export async function getRealtimeData(stationId: string): Promise<RealtimeResult> {
  return fetchRealtimeData(stationId);
}

// ---------------------------------------------------------------------------
// Flow readings — merges CSV (historical) + real-time (CEHQ)
// ---------------------------------------------------------------------------

/**
 * Get recent flow readings, preferring real-time CEHQ data over CSV files.
 * Real-time daily averages override CSV values for overlapping dates.
 */
export async function getRecentReadings(
  stationId: string,
  lastNDays: number = 14,
): Promise<FlowReading[]> {
  // 1. Load from CSV (historical file)
  const csvReadings = loadCsvReadings(stationId);

  // 2. Fetch real-time from CEHQ
  let realtime: RealtimeResult | null = null;
  try {
    realtime = await fetchRealtimeData(stationId);
  } catch {
    // CEHQ unavailable — fall back to CSV only
  }

  // 3. Merge: real-time wins over CSV for overlapping dates
  const byDate = new Map<string, { flow: number; source: "realtime" | "csv" }>();

  for (const r of csvReadings) {
    byDate.set(r.date, { flow: r.flow, source: "csv" });
  }

  if (realtime) {
    for (const [date, avgFlow] of realtime.dailyAverages) {
      byDate.set(date, { flow: avgFlow, source: "realtime" });
    }
  }

  // 4. Sort by date and take last N days
  const sorted = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-lastNDays);

  return sorted.map(([date, { flow, source }]) =>
    FlowReadingSchema.parse({
      stationId,
      timestamp: `${date}T12:00:00Z`,
      flow,
      source: source === "realtime" ? "gauge" : "gauge",
      quality: source === "realtime" ? "provisional" : "verified",
    }),
  );
}

// ---------------------------------------------------------------------------
// Internal: CSV loader
// ---------------------------------------------------------------------------

function loadCsvReadings(
  stationId: string,
): { date: string; flow: number }[] {
  const csvPath = join(PARSED_DIR, `${stationId}_flow.csv`);
  let csv: string;
  try {
    csv = readFileSync(csvPath, "utf-8");
  } catch {
    return [];
  }

  const lines = csv.trim().split("\n").slice(1);
  const readings: { date: string; flow: number }[] = [];

  for (const line of lines) {
    const [date, flowStr] = line.split(",");
    if (!date || !flowStr) continue;
    const flow = parseFloat(flowStr);
    if (isNaN(flow) || flow <= 0) continue;
    readings.push({ date, flow });
  }

  return readings;
}
