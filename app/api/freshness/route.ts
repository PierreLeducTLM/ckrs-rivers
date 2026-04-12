export const dynamic = "force-dynamic";

import { sql } from "@/lib/db/client";

/**
 * Lightweight endpoint that returns the latest generated_at timestamp
 * from the forecast cache. Used by the client to detect when fresh
 * data is available so it can reload.
 *
 * GET /api/freshness            → max across all stations
 * GET /api/freshness?station=X  → for a specific station
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const station = searchParams.get("station");

  const rows = station
    ? await sql(
        `SELECT generated_at::text AS ts FROM forecast_cache WHERE station_id = $1`,
        [station],
      )
    : await sql(
        `SELECT MAX(generated_at)::text AS ts FROM forecast_cache`,
      );

  return Response.json(
    { ts: rows[0]?.ts ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
