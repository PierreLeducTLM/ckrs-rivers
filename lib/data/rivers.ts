/**
 * Shared data layer — loads river stations and flow readings from parsed files.
 * Used by both server components and API routes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cache } from "react";

import { RiverStationSchema, type RiverStation } from "@/lib/domain/river-station";
import { FlowReadingSchema, type FlowReading } from "@/lib/domain/flow-reading";
import type { TrainedModel } from "@/lib/model/types";

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

export const getModel = cache((): TrainedModel => {
  return JSON.parse(readFileSync(MODEL_PATH, "utf-8"));
});

export const getRecentReadings = cache(
  (stationId: string, lastNDays: number = 14): FlowReading[] => {
    const csvPath = join(PARSED_DIR, `${stationId}_flow.csv`);
    let csv: string;
    try {
      csv = readFileSync(csvPath, "utf-8");
    } catch {
      return [];
    }

    const lines = csv.trim().split("\n").slice(1);
    const allReadings: { date: string; flow: number; remark: string }[] = [];

    for (const line of lines) {
      const [date, flowStr, remark] = line.split(",");
      if (!date || !flowStr) continue;
      const flow = parseFloat(flowStr);
      if (isNaN(flow) || flow <= 0) continue;
      allReadings.push({ date, flow, remark });
    }

    return allReadings.slice(-lastNDays).map((r) =>
      FlowReadingSchema.parse({
        stationId,
        timestamp: `${r.date}T12:00:00Z`,
        flow: r.flow,
        source: "gauge",
        quality: r.remark === "P" ? "provisional" : "verified",
      }),
    );
  },
);

export function getStationById(id: string): RiverStation | undefined {
  return getStations().find((s) => s.id === id);
}
