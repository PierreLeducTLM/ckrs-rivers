import { NextRequest } from "next/server";

import { sql } from "@/lib/db/client";

/**
 * POST /api/notifications/subscribe-station?token=xxx
 *
 * Body: { stationId: string }
 * Adds a subscription for a confirmed subscriber.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return Response.json({ error: "Token required" }, { status: 400 });
  }

  const subscribers = (await sql(
    `SELECT id FROM subscribers WHERE token = $1 AND confirmed = true`,
    [token],
  )) as Array<{ id: string }>;

  if (subscribers.length === 0) {
    return Response.json({ error: "Invalid or unconfirmed token" }, { status: 404 });
  }

  const body = (await request.json()) as { stationId?: string };
  if (!body.stationId) {
    return Response.json({ error: "stationId required" }, { status: 400 });
  }

  // Verify station exists
  const stations = (await sql(
    `SELECT id, name FROM stations WHERE id = $1`,
    [body.stationId],
  )) as Array<{ id: string; name: string }>;

  if (stations.length === 0) {
    return Response.json({ error: "Station not found" }, { status: 404 });
  }

  await sql(
    `INSERT INTO subscriptions (subscriber_id, station_id)
     VALUES ($1, $2)
     ON CONFLICT (subscriber_id, station_id) DO UPDATE SET active = true`,
    [subscribers[0].id, body.stationId],
  );

  return Response.json({
    success: true,
    stationName: stations[0].name,
  });
}
