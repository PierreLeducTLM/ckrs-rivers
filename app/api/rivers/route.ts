import { getStations } from "@/lib/data/rivers";
import { sql } from "@/lib/db/client";

export async function GET() {
  const stations = await getStations();

  // Get cached last flow for each station
  const cacheRows = await sql(
    `SELECT station_id, forecast_json->'lastFlow'->>'flow' as last_flow,
            forecast_json->'lastFlow'->>'date' as last_date,
            generated_at::text as updated_at
     FROM forecast_cache`,
  ) as Array<{ station_id: string; last_flow: string | null; last_date: string | null; updated_at: string }>;
  const cacheMap = new Map(cacheRows.map((r) => [r.station_id, r]));

  const rivers = stations.map((s) => {
    const cache = cacheMap.get(s.id);
    return {
      id: s.id,
      name: s.name,
      coordinates: { lat: Number(s.coordinates.lat), lon: Number(s.coordinates.lon) },
      catchmentArea: s.catchmentArea ? Number(s.catchmentArea) : null,
      lastFlow: cache?.last_flow ? parseFloat(cache.last_flow) : null,
      lastDate: cache?.last_date ?? null,
    };
  });

  return Response.json(rivers);
}
