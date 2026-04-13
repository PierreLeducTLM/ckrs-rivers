/**
 * Import sections from whitewater.guide export into existing stations table.
 * No schema changes required — maps only to existing columns.
 *
 *   npx tsx scripts/import-whitewater-guide.ts
 *
 * Only imports sections linked to a valid 6-digit CEHQ gauge.
 * Multiple sections sharing the same gauge get suffixed IDs (e.g. 040204, 040204_2).
 *
 * Options:
 *   --dry-run    Print what would be inserted without touching the DB
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

// ---------------------------------------------------------------------------
// Types for the whitewater.guide export format
// ---------------------------------------------------------------------------

interface WwgCoord {
  coordinates: [number, number, number]; // [lon, lat, alt]
}

interface WwgGauge {
  id: string;
  name: string;
  code: string;
  url: string;
}

interface WwgFlows {
  minimum: number | null;
  maximum: number | null;
  optimum: number | null;
  impossible: number | null;
  approximate: boolean;
  formula: string | null;
}

interface WwgSection {
  id: string;
  name: string;
  description: string | null;
  difficulty: number;
  difficultyXtra: string | null;
  distance: number | null;
  drop: number | null;
  duration: number | null;
  river: { id: string; name: string };
  putIn: WwgCoord;
  takeOut: WwgCoord;
  shape: [number, number, number][];
  gauge: WwgGauge | null;
  flows: WwgFlows | null;
  verified: boolean;
  hidden: boolean;
}

interface WwgExport {
  region: string;
  rivers: unknown[];
  sections: WwgSection[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIFF_MAP: Record<number, string> = {
  0: "0",
  1: "I",
  1.5: "I-II",
  2: "II",
  2.5: "II-III",
  3: "III",
  3.5: "III-IV",
  4: "IV",
  4.5: "IV-V",
  5: "V",
  5.5: "V-VI",
  6: "VI",
};

function diffToRapidClass(d: number, extra: string | null): string {
  const base = DIFF_MAP[d] ?? String(d);
  return extra ? `${base} (${extra})` : base;
}

function isCehqCode(code: string | undefined | null): boolean {
  return !!code && /^\d{6}$/.test(code);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  if (!dryRun) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      console.error("ERROR: DATABASE_URL environment variable is required");
      process.exit(1);
    }
  }

  const sql = dryRun ? null : neon(process.env.DATABASE_URL!);

  // 1. Read export
  const exportPath = join(process.cwd(), "full-export.json");
  const data: WwgExport = JSON.parse(readFileSync(exportPath, "utf-8"));
  console.log(`Loaded ${data.sections.length} sections from ${data.rivers.length} rivers\n`);

  // 2. Filter — only sections with a valid CEHQ 6-digit gauge code
  const sections = data.sections.filter(
    (s) => !s.hidden && s.gauge && isCehqCode(s.gauge.code),
  );
  const skippedNonCehq = data.sections.filter(
    (s) => !s.hidden && (!s.gauge || !isCehqCode(s.gauge?.code)),
  ).length;
  console.log(`CEHQ-gauged sections to import: ${sections.length}`);
  console.log(`Skipped (no CEHQ gauge): ${skippedNonCehq}`);

  // 3. Group sections by CEHQ gauge code to assign deterministic IDs
  const byGauge = new Map<string, WwgSection[]>();

  for (const s of sections) {
    const code = s.gauge!.code;
    const group = byGauge.get(code) ?? [];
    group.push(s);
    byGauge.set(code, group);
  }

  // 4. Build station records
  interface StationRecord {
    id: string;
    station_number: string;
    name: string;
    lat: number;
    lon: number;
    put_in_lat: number;
    put_in_lon: number;
    take_out_lat: number;
    take_out_lon: number;
    river_path: [number, number][];
    paddling_min: number | null;
    paddling_ideal: number | null;
    paddling_max: number | null;
    rapid_class: string;
    description: string | null;
    status: string;
  }

  const records: StationRecord[] = [];

  // CEHQ-gauged sections
  for (const [gaugeCode, group] of byGauge) {
    // Sort alphabetically by full name for deterministic ID assignment
    const sorted = group.sort((a, b) => {
      const nameA = `${a.river.name} - ${a.name}`;
      const nameB = `${b.river.name} - ${b.name}`;
      return nameA.localeCompare(nameB);
    });

    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i];
      const id = i === 0 ? gaugeCode : `${gaugeCode}_${i + 1}`;
      records.push({
        id,
        station_number: gaugeCode,
        name: `${s.river.name} - ${s.name}`,
        lat: s.putIn.coordinates[1],
        lon: s.putIn.coordinates[0],
        put_in_lat: s.putIn.coordinates[1],
        put_in_lon: s.putIn.coordinates[0],
        take_out_lat: s.takeOut.coordinates[1],
        take_out_lon: s.takeOut.coordinates[0],
        river_path: s.shape.map((p) => [p[1], p[0]] as [number, number]),
        paddling_min: s.flows?.minimum ?? null,
        paddling_ideal: s.flows?.optimum ?? null,
        paddling_max: s.flows?.maximum ?? null,
        rapid_class: diffToRapidClass(s.difficulty, s.difficultyXtra),
        description: s.description,
        status: "ready",
      });
    }
  }

  console.log(`\nPrepared ${records.length} station records (all CEHQ-gauged)`);

  if (dryRun) {
    console.log("\n--- DRY RUN: first 10 records ---");
    for (const r of records.slice(0, 10)) {
      console.log(`  ${r.id} | ${r.station_number} | ${r.name} | ${r.status} | rapid=${r.rapid_class} | min=${r.paddling_min} ideal=${r.paddling_ideal} max=${r.paddling_max}`);
    }
    console.log(`\n--- DRY RUN complete. ${records.length} records would be inserted. ---`);
    return;
  }

  // 5. Check for existing stations to avoid collisions
  const existing = (await sql!.query(
    `SELECT id FROM stations`,
  )) as Array<{ id: string }>;
  const existingIds = new Set(existing.map((r) => r.id));
  console.log(`\nExisting stations in DB: ${existingIds.size}`);

  let inserted = 0;
  let skipped = 0;

  // 6. Insert records
  for (const r of records) {
    if (existingIds.has(r.id)) {
      console.log(`  SKIP ${r.id} (already exists)`);
      skipped++;
      continue;
    }

    await sql!.query(
      `INSERT INTO stations (
        id, station_number, name, lat, lon,
        put_in_lat, put_in_lon, take_out_lat, take_out_lon,
        river_path, paddling_min, paddling_ideal, paddling_max,
        rapid_class, description, status
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16
      )`,
      [
        r.id,
        r.station_number,
        r.name,
        r.lat,
        r.lon,
        r.put_in_lat,
        r.put_in_lon,
        r.take_out_lat,
        r.take_out_lon,
        JSON.stringify(r.river_path),
        r.paddling_min,
        r.paddling_ideal,
        r.paddling_max,
        r.rapid_class,
        r.description,
        r.status,
      ],
    );
    inserted++;
  }

  console.log(`\n=== Import complete ===`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped:  ${skipped} (already existed)`);
  console.log(`  Total:    ${records.length}`);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
