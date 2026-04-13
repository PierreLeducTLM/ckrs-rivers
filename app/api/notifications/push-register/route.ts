import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";

/**
 * POST /api/notifications/push-register
 *
 * Body: { token: string, platform: 'ios' | 'android' | 'web', stationIds?: string[], subscriberId?: string }
 * Registers or updates a device push token. Optionally links to a subscriber.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    token?: string;
    platform?: string;
    stationIds?: string[];
    subscriberId?: string;
  };

  const token = body.token?.trim();
  const platform = body.platform?.trim();

  if (!token || !platform) {
    return Response.json(
      { error: "token and platform are required" },
      { status: 400 },
    );
  }

  if (!["ios", "android", "web"].includes(platform)) {
    return Response.json(
      { error: "platform must be ios, android, or web" },
      { status: 400 },
    );
  }

  const stationIds = body.stationIds ?? [];

  // Resolve subscriberId from query param subscriber token if provided
  let subscriberId: string | null = body.subscriberId ?? null;
  if (!subscriberId) {
    const subToken = request.nextUrl.searchParams.get("token");
    if (subToken) {
      const rows = await sql(
        `SELECT id FROM subscribers WHERE token = $1 AND confirmed = true`,
        [subToken],
      );
      if (rows.length > 0) subscriberId = rows[0].id;
    }
  }

  await sql(
    `INSERT INTO push_devices (token, platform, station_ids, subscriber_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (token) DO UPDATE
       SET platform = EXCLUDED.platform,
           station_ids = EXCLUDED.station_ids,
           subscriber_id = COALESCE(EXCLUDED.subscriber_id, push_devices.subscriber_id),
           active = true,
           updated_at = now()`,
    [token, platform, stationIds, subscriberId],
  );

  return Response.json({ success: true });
}

/**
 * GET /api/notifications/push-register?token=<push-token>
 *
 * Returns the station_ids and preferences for this push device.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return Response.json({ error: "token is required" }, { status: 400 });
  }

  const rows = await sql(
    `SELECT station_ids, preferences, subscriber_id FROM push_devices WHERE token = $1 AND active = true`,
    [token],
  );

  if (rows.length === 0) {
    return Response.json({ stationIds: [], preferences: {} });
  }

  return Response.json({
    stationIds: rows[0].station_ids ?? [],
    preferences: rows[0].preferences ?? {},
    subscriberId: rows[0].subscriber_id,
  });
}

/**
 * PATCH /api/notifications/push-register
 *
 * Body: { token: string, stationId: string, subscribe: boolean, platform?: string }
 * Adds or removes a single station from the device's station_ids.
 * Uses upsert so a late registration still persists the subscription.
 */
export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as {
    token?: string;
    stationId?: string;
    subscribe?: boolean;
    platform?: string;
  };

  const token = body.token?.trim();
  const stationId = body.stationId?.trim();
  const subscribe = body.subscribe;

  if (!token || !stationId || subscribe === undefined) {
    return Response.json(
      { error: "token, stationId, and subscribe are required" },
      { status: 400 },
    );
  }

  if (subscribe) {
    // Upsert: if device row doesn't exist yet (late registration), create it
    const platform = body.platform?.trim() ?? null;
    await sql(
      `INSERT INTO push_devices (token, platform, station_ids)
       VALUES ($1, COALESCE($3, 'ios'), ARRAY[$2])
       ON CONFLICT (token) DO UPDATE
         SET station_ids = array_append(
               array_remove(push_devices.station_ids, $2), $2
             ),
             active = true,
             updated_at = now()`,
      [token, stationId, platform],
    );
  } else {
    await sql(
      `UPDATE push_devices
       SET station_ids = array_remove(station_ids, $2),
           updated_at = now()
       WHERE token = $1 AND active = true`,
      [token, stationId],
    );
  }

  return Response.json({ success: true });
}
