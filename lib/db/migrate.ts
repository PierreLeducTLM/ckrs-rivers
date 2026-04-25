/**
 * Run database migrations against Neon PostgreSQL.
 *
 *   npx tsx lib/db/migrate.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const sql = neon(url);
  const schemaPath = join(import.meta.dirname ?? __dirname, "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");

  // Split on semicolons, strip leading comments, keep non-empty statements
  const statements = schema
    .split(";")
    .map((s) => s.replace(/^(\s*--[^\n]*\n)*/g, "").trim())
    .filter((s) => s.length > 0);

  console.log(`Running ${statements.length} migration statements...`);

  for (const statement of statements) {
    const preview = statement.slice(0, 60).replace(/\n/g, " ");
    console.log(`  → ${preview}...`);
    await sql.query(statement);
  }

  // Run ALTER TABLE statements for adding columns to existing tables
  const alterStatements = [
    `ALTER TABLE stations ADD COLUMN IF NOT EXISTS station_number TEXT`,
    `UPDATE stations SET station_number = id WHERE station_number IS NULL`,
    `ALTER TABLE stations ALTER COLUMN station_number SET NOT NULL`,
    `ALTER TABLE forecast_cache ADD COLUMN IF NOT EXISTS weather_json JSONB`,
    `ALTER TABLE stations ADD COLUMN IF NOT EXISTS weather_city TEXT`,
    `ALTER TABLE stations ADD COLUMN IF NOT EXISTS weather_lat DOUBLE PRECISION`,
    `ALTER TABLE stations ADD COLUMN IF NOT EXISTS weather_lon DOUBLE PRECISION`,
    `ALTER TABLE stations ADD COLUMN IF NOT EXISTS put_in_lat DOUBLE PRECISION`,
    `ALTER TABLE stations ADD COLUMN IF NOT EXISTS put_in_lon DOUBLE PRECISION`,
    `ALTER TABLE stations ADD COLUMN IF NOT EXISTS take_out_lat DOUBLE PRECISION`,
    `ALTER TABLE stations ADD COLUMN IF NOT EXISTS take_out_lon DOUBLE PRECISION`,
    `ALTER TABLE stations ADD COLUMN IF NOT EXISTS river_path JSONB`,
    `ALTER TABLE stations ADD COLUMN IF NOT EXISTS rapid_class TEXT`,
    `ALTER TABLE stations ADD COLUMN IF NOT EXISTS description TEXT`,
    `ALTER TABLE stations ADD COLUMN IF NOT EXISTS rapids JSONB NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE stations ALTER COLUMN station_number DROP NOT NULL`,
    `ALTER TABLE push_devices ADD COLUMN IF NOT EXISTS subscriber_id TEXT REFERENCES subscribers(id) ON DELETE SET NULL`,
    `ALTER TABLE push_devices ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb`,
    `CREATE INDEX IF NOT EXISTS idx_push_devices_subscriber ON push_devices(subscriber_id)`,
    `INSERT INTO feature_flags (key, state, label, description) VALUES ('rapids', 'preview', 'Rapids', 'Place named rapids on rivers and swipe through them on a dedicated screen.') ON CONFLICT (key) DO NOTHING`,
  ];

  console.log(`\nRunning ${alterStatements.length} alter statements...`);
  for (const stmt of alterStatements) {
    const preview = stmt.slice(0, 60);
    console.log(`  → ${preview}...`);
    try {
      await sql.query(stmt);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Ignore "already exists" errors
      if (!msg.includes("already exists")) {
        console.error(`    Error: ${msg}`);
      }
    }
  }

  console.log("\nMigration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
