/**
 * Delete all stations and their associated data (flow readings, models, training runs).
 *
 *   npx tsx scripts/clear-db.ts
 */
import { neon } from "@neondatabase/serverless";

async function clearAll() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const sql = neon(url);

  console.log("Deleting all data...");
  await sql.query("DELETE FROM training_runs");
  console.log("  training_runs cleared");
  await sql.query("DELETE FROM models");
  console.log("  models cleared");
  await sql.query("DELETE FROM flow_readings");
  console.log("  flow_readings cleared");
  await sql.query("DELETE FROM stations");
  console.log("  stations cleared");

  console.log("\nAll data deleted.");
}

clearAll().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
