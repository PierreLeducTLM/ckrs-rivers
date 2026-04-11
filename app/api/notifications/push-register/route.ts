import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";

/**
 * POST /api/notifications/push-register
 *
 * Body: { token: string, platform: 'ios' | 'android' | 'web', stationIds?: string[] }
 * Registers or updates a device push token.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    token?: string;
    platform?: string;
    stationIds?: string[];
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

  await sql(
    `INSERT INTO push_devices (token, platform, station_ids)
     VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE
       SET platform = EXCLUDED.platform,
           station_ids = EXCLUDED.station_ids,
           active = true,
           updated_at = now()`,
    [token, platform, stationIds],
  );

  return Response.json({ success: true });
}

/**
 * GET /api/notifications/push-register?token=<push-token>
 *
 * Returns the station_ids subscribed for this push device.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return Response.json({ error: "token is required" }, { status: 400 });
  }

  const rows = await sql(
    `SELECT station_ids FROM push_devices WHERE token = $1 AND active = true`,
    [token],
  );

  if (rows.length === 0) {
    return Response.json({ stationIds: [] });
  }

  return Response.json({ stationIds: rows[0].station_ids ?? [] });
}

/**
 * PATCH /api/notifications/push-register
 *
 * Body: { token: string, stationId: string, subscribe: boolean }
 * Adds or removes a single station from the device's station_ids.
 */
export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as {
    token?: string;
    stationId?: string;
    subscribe?: boolean;
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
    await sql(
      `UPDATE push_devices
       SET station_ids = array_append(
             array_remove(station_ids, $2), $2
           ),
           updated_at = now()
       WHERE token = $1 AND active = true`,
      [token, stationId],
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
