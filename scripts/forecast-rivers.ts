/**
 * Generate a real 7-day flow forecast using weather predictions.
 *
 *   npx tsx scripts/forecast-rivers.ts
 *
 * This fetches the actual Open-Meteo weather forecast (next 7 days)
 * and uses the trained model to predict river flow.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { RiverStationSchema, type RiverStation } from "@/lib/domain/river-station";
import { FlowReadingSchema, type FlowReading } from "@/lib/domain/flow-reading";
import { generateForecast } from "@/lib/prediction/forecast";
import type { TrainedModel } from "@/lib/model/types";

const PARSED_DIR = join(process.cwd(), "datas", "parsed");
const MODEL_PATH = join(process.cwd(), "datas", "models", "flow-model.json");

function loadStations(): RiverStation[] {
  const raw = JSON.parse(readFileSync(join(PARSED_DIR, "stations.json"), "utf-8"));
  return (raw as Array<{ id: string; name: string; catchmentArea: number | null; lat: number; lon: number }>).map(
    (s) =>
      RiverStationSchema.parse({
        id: s.id,
        name: s.name,
        coordinates: { lat: s.lat, lon: s.lon },
        catchmentArea: s.catchmentArea ?? undefined,
      }),
  );
}

function loadRecentReadings(stationId: string, lastNDays: number = 14): FlowReading[] {
  const csv = readFileSync(join(PARSED_DIR, `${stationId}_flow.csv`), "utf-8");
  const lines = csv.trim().split("\n").slice(1);
  const readings: FlowReading[] = [];

  // Get the last N days of readings for lag features
  const allReadings: { date: string; flow: number; remark: string }[] = [];
  for (const line of lines) {
    const [date, flowStr, remark] = line.split(",");
    if (!date || !flowStr) continue;
    const flow = parseFloat(flowStr);
    if (isNaN(flow) || flow <= 0) continue;
    allReadings.push({ date, flow, remark });
  }

  // Take last N days
  const recent = allReadings.slice(-lastNDays);
  for (const r of recent) {
    readings.push(
      FlowReadingSchema.parse({
        stationId,
        timestamp: `${r.date}T12:00:00Z`,
        flow: r.flow,
        source: "gauge",
        quality: r.remark === "P" ? "provisional" : "verified",
      }),
    );
  }

  return readings;
}

async function main() {
  const stations = loadStations();
  const model: TrainedModel = JSON.parse(readFileSync(MODEL_PATH, "utf-8"));

  console.log("=== River Flow Forecast ===");
  console.log(`Model: ${model.numRounds} trees, test NSE=${model.evaluation.test.nse.toFixed(3)}\n`);

  for (const station of stations) {
    console.log(`\n━━━ ${station.name} (${station.id}) ━━━`);
    console.log(`    Coords: ${Number(station.coordinates.lat).toFixed(2)}°N, ${Number(station.coordinates.lon).toFixed(2)}°W`);

    const recentReadings = loadRecentReadings(station.id);
    if (recentReadings.length === 0) {
      console.log("    No recent readings — skipping");
      continue;
    }

    const lastReading = recentReadings[recentReadings.length - 1];
    console.log(`    Last observed: ${lastReading.timestamp.slice(0, 10)} — ${Number(lastReading.flow).toFixed(1)} m³/s`);
    console.log(`    Fetching weather forecast...\n`);

    try {
      const result = await generateForecast({
        station,
        model,
        recentFlowReadings: recentReadings,
        forecastDays: 7,
      });

      console.log("    Date         Flow (m³/s)    Range           Horizon  Confidence");
      console.log("    ─────────    ───────────    ─────────────   ───────  ──────────");

      for (const f of result.forecasts) {
        const flowStr = f.flow.toFixed(1).padStart(8);
        const rangeStr = `${f.flowLow.toFixed(1)}–${f.flowHigh.toFixed(1)}`.padStart(13);
        const horizonStr = `Day+${f.horizon}`.padStart(5);
        const confStr = f.confidence.padStart(6);
        console.log(`    ${f.date}    ${flowStr}    ${rangeStr}   ${horizonStr}  ${confStr}`);
      }

      if (result.nextOptimalWindow) {
        console.log(`\n    Next optimal window: ${result.nextOptimalWindow.startDate} to ${result.nextOptimalWindow.endDate}`);
      }
    } catch (err) {
      console.log(`    Error: ${err instanceof Error ? err.message : err}`);
    }
  }
}

main().catch(console.error);
