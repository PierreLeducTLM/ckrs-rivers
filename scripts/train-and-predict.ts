/**
 * End-to-end pipeline: load river data → fetch weather → compute features → train → predict.
 *
 *   npx tsx scripts/train-and-predict.ts
 *
 * Uses last 3 years of data for training (Open-Meteo free tier limit).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import type { RiverStation } from "@/lib/domain/river-station";
import { RiverStationSchema } from "@/lib/domain/river-station";
import { FlowReadingSchema, type FlowReading } from "@/lib/domain/flow-reading";
import { getHistoricalWeather } from "@/lib/weather/weather-service";
import { computeFeatureMatrix } from "@/lib/features/compute";
import { trainModel } from "@/lib/model/train";
import { serializeModel, hydrateModel } from "@/lib/model/serialize";
import { predictFlow } from "@/lib/model/gradient-boost";
import {
  FEATURE_COLUMNS,
  PREDICTION_HORIZON_INDEX,
  NUM_FEATURES,
} from "@/lib/model/types";

const PARSED_DIR = join(process.cwd(), "datas", "parsed");
const MODEL_DIR = join(process.cwd(), "datas", "models");

// We use last 3 years to stay within Open-Meteo free archive range
const TRAINING_START = "2022-01-01";
const TRAINING_END = "2025-12-31";

// ---------------------------------------------------------------------------
// Load stations
// ---------------------------------------------------------------------------

function loadStations(): RiverStation[] {
  const raw = JSON.parse(
    readFileSync(join(PARSED_DIR, "stations.json"), "utf-8"),
  );
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

// ---------------------------------------------------------------------------
// Load flow readings
// ---------------------------------------------------------------------------

function loadFlowReadings(stationId: string): FlowReading[] {
  const csv = readFileSync(
    join(PARSED_DIR, `${stationId}_flow.csv`),
    "utf-8",
  );
  const lines = csv.trim().split("\n").slice(1); // skip header
  const readings: FlowReading[] = [];

  for (const line of lines) {
    const [date, flowStr, remark] = line.split(",");
    if (!date || !flowStr) continue;
    const flow = parseFloat(flowStr);
    if (isNaN(flow) || flow <= 0) continue;
    if (date < TRAINING_START || date > TRAINING_END) continue;

    readings.push(
      FlowReadingSchema.parse({
        stationId,
        timestamp: `${date}T12:00:00Z`,
        flow,
        source: remark === "E" ? "estimated" : "gauge",
        quality:
          remark === "P" || remark === "P*"
            ? "provisional"
            : remark === "E"
              ? "estimated"
              : "verified",
      }),
    );
  }

  return readings;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const stations = loadStations();
  console.log(`Loaded ${stations.length} stations\n`);

  // Step 1: Fetch weather + compute features for all stations
  const allFeatureRows: ReturnType<typeof computeFeatureMatrix> = [];
  const allFlowReadings: FlowReading[] = [];

  for (const station of stations) {
    console.log(`--- ${station.id}: ${station.name} ---`);

    // Load flow readings
    const readings = loadFlowReadings(station.id);
    console.log(`  Flow readings (${TRAINING_START}–${TRAINING_END}): ${readings.length}`);

    if (readings.length < 100) {
      console.log("  Skipping (too few readings)\n");
      continue;
    }

    allFlowReadings.push(...readings);

    // Fetch weather (cached after first run)
    console.log("  Fetching weather...");
    const weather = await getHistoricalWeather(
      station,
      TRAINING_START,
      TRAINING_END,
    );
    console.log(`  Weather days: ${weather.length}`);

    // Compute features
    console.log("  Computing features...");
    const rows = computeFeatureMatrix({
      station,
      weatherTimeline: weather,
      flowReadings: readings,
      mode: "training",
      startDate: TRAINING_START,
      endDate: TRAINING_END,
    });
    console.log(`  Feature rows: ${rows.length}\n`);
    allFeatureRows.push(...rows);
  }

  console.log(`\n=== Training dataset ===`);
  console.log(`  Total feature rows: ${allFeatureRows.length}`);
  console.log(`  Total flow readings: ${allFlowReadings.length}`);

  // Step 2: Train model
  console.log("\n=== Training model ===");
  const model = trainModel({
    featureRows: allFeatureRows,
    flowReadings: allFlowReadings,
    config: {
      numRounds: 100,
      maxDepth: 5,
      learningRate: 0.1,
      earlyStoppingRounds: 15,
      thresholdFlow: 15,
    },
    onProgress: ({ round, totalRounds, valLoss }) => {
      if (round % 10 === 0 || round === totalRounds - 1) {
        console.log(
          `  Round ${round}/${totalRounds} — val loss: ${valLoss.toFixed(4)}`,
        );
      }
    },
  });

  console.log(`\n=== Evaluation ===`);
  console.log(`  Trees: ${model.numRounds}`);
  console.log(`  Train — NSE: ${model.evaluation.train.nse.toFixed(3)}, MAPE: ${model.evaluation.train.mape.toFixed(1)}%`);
  console.log(`  Val   — NSE: ${model.evaluation.val.nse.toFixed(3)}, MAPE: ${model.evaluation.val.mape.toFixed(1)}%`);
  console.log(`  Test  — NSE: ${model.evaluation.test.nse.toFixed(3)}, MAPE: ${model.evaluation.test.mape.toFixed(1)}%`);

  // Step 3: Save model
  mkdirSync(MODEL_DIR, { recursive: true });
  const modelPath = join(MODEL_DIR, "flow-model.json");
  writeFileSync(modelPath, serializeModel(model));
  console.log(`\n→ Model saved to ${modelPath}`);

  // Step 4: Quick prediction test
  console.log(`\n=== Quick prediction test ===`);
  const testStation = stations[0];
  const predictor = hydrateModel(model);

  // Use last 5 feature rows as test
  const testRows = allFeatureRows
    .filter((r) => r._stationId === testStation.id)
    .slice(-5);

  for (const row of testRows) {
    const vec = new Float64Array(NUM_FEATURES);
    for (let i = 0; i < FEATURE_COLUMNS.length; i++) {
      const key = FEATURE_COLUMNS[i];
      const val = row[key];
      vec[i] = val === null ? NaN : Number(val);
    }
    vec[PREDICTION_HORIZON_INDEX] = 0;

    const predicted = predictFlow(predictor, vec);
    const actual = allFlowReadings.find(
      (r) =>
        r.stationId === row._stationId &&
        r.timestamp.startsWith(row._date),
    );
    const actualFlow = actual?.flow ? Number(actual.flow) : null;

    console.log(
      `  ${row._date}: predicted=${predicted.toFixed(1)} m³/s` +
        (actualFlow !== null ? `, actual=${actualFlow.toFixed(1)} m³/s` : ""),
    );
  }
}

main().catch(console.error);
