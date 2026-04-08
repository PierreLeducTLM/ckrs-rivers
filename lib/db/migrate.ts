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
    `ALTER TABLE forecast_cache ADD COLUMN IF NOT EXISTS weather_json JSONB`,
    `ALTER TABLE stations ADD COLUMN IF NOT EXISTS weather_city TEXT`,
    `ALTER TABLE stations ADD COLUMN IF NOT EXISTS weather_lat DOUBLE PRECISION`,
    `ALTER TABLE stations ADD COLUMN IF NOT EXISTS weather_lon DOUBLE PRECISION`,
    `ALTER TABLE stations ADD COLUMN IF NOT EXISTS put_in_lat DOUBLE PRECISION`,
    `ALTER TABLE stations ADD COLUMN IF NOT EXISTS put_in_lon DOUBLE PRECISION`,
    `ALTER TABLE stations ADD COLUMN IF NOT EXISTS take_out_lat DOUBLE PRECISION`,
    `ALTER TABLE stations ADD COLUMN IF NOT EXISTS take_out_lon DOUBLE PRECISION`,
    `ALTER TABLE stations ADD COLUMN IF NOT EXISTS river_path JSONB`,
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
