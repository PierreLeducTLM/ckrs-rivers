/**
 * One-time migration: seed Neon PostgreSQL from existing file-based data.
 *
 *   npx tsx scripts/migrate-to-db.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const PARSED_DIR = join(process.cwd(), "datas", "parsed");
const MODEL_PATH = join(process.cwd(), "datas", "models", "flow-model.json");

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const sql = neon(url);

  // ---- 1. Migrate stations ----
  console.log("\n=== Migrating stations ===");
  const stationsRaw = JSON.parse(
    readFileSync(join(PARSED_DIR, "stations.json"), "utf-8"),
  ) as Array<{
    id: string;
    name: string;
    catchmentArea: number | null;
    regime: string;
    lat: number;
    lon: number;
    paddling?: { min?: number; ideal?: number; max?: number };
  }>;

  for (const s of stationsRaw) {
    console.log(`  Station ${s.id}: ${s.name}`);
    await sql.query(
      `INSERT INTO stations (id, name, lat, lon, catchment_area_km2, regime, paddling_min, paddling_ideal, paddling_max, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ready')
       ON CONFLICT (id) DO NOTHING`,
      [
        s.id,
        s.name,
        s.lat,
        s.lon,
        s.catchmentArea,
        s.regime,
        s.paddling?.min ?? null,
        s.paddling?.ideal ?? null,
        s.paddling?.max ?? null,
      ],
    );
  }
  console.log(`  → ${stationsRaw.length} stations migrated`);

  // ---- 2. Migrate flow readings ----
  console.log("\n=== Migrating flow readings ===");
  for (const s of stationsRaw) {
    const csvPath = join(PARSED_DIR, `${s.id}_flow.csv`);
    let csv: string;
    try {
      csv = readFileSync(csvPath, "utf-8");
    } catch {
      console.log(`  Station ${s.id}: no CSV file, skipping`);
      continue;
    }

    const lines = csv.trim().split("\n").slice(1); // skip header
    const rows: [string, string, number][] = [];

    for (const line of lines) {
      const [date, flowStr] = line.split(",");
      if (!date || !flowStr) continue;
      const flow = parseFloat(flowStr);
      if (isNaN(flow) || flow <= 0) continue;
      rows.push([s.id, date, flow]);
    }

    // Batch insert in chunks of 500
    const BATCH_SIZE = 500;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const values = batch
        .map(
          (_, idx) =>
            `($${idx * 3 + 1}, $${idx * 3 + 2}, $${idx * 3 + 3}, 'csv', 'validated')`,
        )
        .join(", ");
      const params = batch.flat();

      await sql.query(
        `INSERT INTO flow_readings (station_id, date, flow_m3s, source, quality)
         VALUES ${values}
         ON CONFLICT (station_id, date) DO NOTHING`,
        params,
      );
    }
    console.log(`  Station ${s.id}: ${rows.length} flow readings migrated`);
  }

  // ---- 3. Migrate model ----
  console.log("\n=== Migrating model ===");
  try {
    const modelJson = JSON.parse(readFileSync(MODEL_PATH, "utf-8"));

    // Insert the global model as the active model for each station
    for (const s of stationsRaw) {
      await sql.query(
        `INSERT INTO models (station_id, version, model_json, nse_test, mape_test, num_trees, num_training_samples, is_active)
         VALUES ($1, 1, $2, $3, $4, $5, $6, true)
         ON CONFLICT (station_id, version) DO NOTHING`,
        [
          s.id,
          JSON.stringify(modelJson),
          modelJson.evaluation?.test?.nse ?? null,
          modelJson.evaluation?.test?.mape ?? null,
          modelJson.numRounds ?? null,
          modelJson.numTrainingSamples ?? null,
        ],
      );
      console.log(`  Model assigned to station ${s.id}`);
    }
  } catch (err) {
    console.log(`  No model file found, skipping: ${err}`);
  }

  console.log("\n=== Migration complete ===");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
