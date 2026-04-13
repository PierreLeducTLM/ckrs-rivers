/**
 * Clean up stations imported with wrong IDs (ww_ prefix / non-CEHQ station_number).
 *
 *   npx tsx scripts/cleanup-bad-import.ts          # preview what will be deleted
 *   npx tsx scripts/cleanup-bad-import.ts --delete  # actually delete
 */
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const doDelete = process.argv.includes("--delete");
  const sql = neon(url);

  // Find all stations with non-CEHQ station_number (not 6 digits)
  const bad = (await sql.query(
    `SELECT id, station_number, name, status FROM stations WHERE station_number !~ '^[0-9]{6}$' ORDER BY id`,
  )) as Array<{ id: string; station_number: string; name: string; status: string }>;

  // Also find ww_ prefixed IDs that somehow have a valid station_number
  const wwIds = (await sql.query(
    `SELECT id, station_number, name, status FROM stations WHERE id LIKE 'ww_%' ORDER BY id`,
  )) as Array<{ id: string; station_number: string; name: string; status: string }>;

  // Merge both sets by id
  const toDelete = new Map<string, { id: string; station_number: string; name: string; status: string }>();
  for (const r of [...bad, ...wwIds]) {
    toDelete.set(r.id, r);
  }

  console.log(`Found ${toDelete.size} stations to clean up:\n`);
  for (const r of toDelete.values()) {
    console.log(`  ${r.id} | stn=${r.station_number} | ${r.name} | status=${r.status}`);
  }

  if (toDelete.size === 0) {
    console.log("Nothing to clean up.");
    return;
  }

  if (!doDelete) {
    console.log(`\nDry run — pass --delete to actually remove these ${toDelete.size} stations.`);
    return;
  }

  const ids = [...toDelete.keys()];
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  const result = await sql.query(
    `DELETE FROM stations WHERE id IN (${placeholders})`,
    ids,
  );

  console.log(`\nDeleted ${toDelete.size} stations (cascade removes flow_readings, models, forecasts).`);
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
