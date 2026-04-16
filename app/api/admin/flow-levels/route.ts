import { sql } from "@/lib/db/client";

export async function GET() {
  const rows = (await sql(
    `SELECT id, name, paddling_min, paddling_ideal, paddling_max
     FROM stations
     WHERE status != 'error'
     ORDER BY name`,
  )) as Array<{
    id: string;
    name: string;
    paddling_min: number | null;
    paddling_ideal: number | null;
    paddling_max: number | null;
  }>;

  return Response.json({ stations: rows });
}
