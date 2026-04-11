import { sql } from "@/lib/db/client";

/**
 * GET /api/admin/subscribers
 *
 * Returns all subscribers with their active subscriptions (station names).
 * No auth gate — the admin page is client-gated via useAdmin().
 */
export async function GET() {
  const rows = (await sql(
    `SELECT
       sub.id,
       sub.email,
       sub.confirmed,
       sub.created_at,
       COALESCE(
         json_agg(
           json_build_object(
             'stationId', sc.station_id,
             'stationName', st.name,
             'active', sc.active
           )
           ORDER BY st.name
         ) FILTER (WHERE sc.id IS NOT NULL),
         '[]'::json
       ) AS subscriptions
     FROM subscribers sub
     LEFT JOIN subscriptions sc ON sc.subscriber_id = sub.id
     LEFT JOIN stations st ON st.id = sc.station_id
     GROUP BY sub.id
     ORDER BY sub.created_at DESC`,
  )) as Array<{
    id: string;
    email: string;
    confirmed: boolean;
    created_at: string;
    subscriptions: Array<{
      stationId: string;
      stationName: string;
      active: boolean;
    }>;
  }>;

  return Response.json({ subscribers: rows });
}
