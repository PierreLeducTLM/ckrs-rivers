import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";

type PushDeviceRow = {
  token: string;
  platform: string;
  station_ids: string[] | null;
  subscriber_id: string | null;
  preferences: Record<string, unknown> | null;
};

async function resolveSubscriberIdFromToken(
  subscriberToken: string | undefined,
): Promise<string | null> {
  if (!subscriberToken) return null;
  const rows = (await sql(
    `SELECT id FROM subscribers WHERE token = $1 AND confirmed = true`,
    [subscriberToken],
  )) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

/**
 * POST /api/notifications/push-register
 *
 * Body: {
 *   token: string,
 *   platform: 'ios' | 'android' | 'web',
 *   stationIds?: string[],
 *   subscriberId?: string,
 *   subscriberToken?: string,  // alternative to subscriberId
 * }
 * Registers or updates a device push token.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    token?: string;
    platform?: string;
    stationIds?: string[];
    subscriberId?: string;
    subscriberToken?: string;
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

  // Only overwrite station_ids when the client explicitly sends them.
  // On mobile, initPushNotifications() POSTs on every app launch to refresh
  // the device token; without this guard, the user's previously-selected
  // rivers would be wiped to [] on every restart.
  const stationIds =
    body.stationIds === undefined ? null : body.stationIds;

  const subscriberId =
    body.subscriberId ??
    (await resolveSubscriberIdFromToken(body.subscriberToken));

  // Upsert. Preserve existing station_ids/subscriber_id unless new values provided.
  await sql(
    `INSERT INTO push_devices (token, platform, station_ids, subscriber_id)
     VALUES ($1, $2, COALESCE($3::TEXT[], ARRAY[]::TEXT[]), $4)
     ON CONFLICT (token) DO UPDATE
       SET platform      = EXCLUDED.platform,
           station_ids   = COALESCE($3::TEXT[], push_devices.station_ids),
           active        = true,
           subscriber_id = COALESCE(EXCLUDED.subscriber_id, push_devices.subscriber_id),
           updated_at    = now()`,
    [token, platform, stationIds, subscriberId],
  );

  return Response.json({ success: true });
}

/**
 * GET /api/notifications/push-register?token=<push-token>
 *
 * Returns the current push_devices row (station_ids + preferences + subscriber link).
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return Response.json({ error: "token is required" }, { status: 400 });
  }

  const rows = (await sql(
    `SELECT token, platform, station_ids, subscriber_id, preferences
       FROM push_devices
      WHERE token = $1 AND active = true`,
    [token],
  )) as PushDeviceRow[];

  if (rows.length === 0) {
    return Response.json({
      stationIds: [],
      preferences: {},
      subscriberId: null,
    });
  }

  const row = rows[0];
  return Response.json({
    stationIds: row.station_ids ?? [],
    preferences: row.preferences ?? {},
    subscriberId: row.subscriber_id,
  });
}

/**
 * PATCH /api/notifications/push-register
 *
 * Body: {
 *   token: string,
 *   stationId: string,
 *   subscribe: boolean,
 *   platform?: 'ios' | 'android' | 'web'  // used if the row doesn't exist yet
 * }
 * Adds or removes a single station from the device's station_ids.
 * Upserts if the row doesn't exist yet (race when APNs token arrives late).
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

  // Resolve platform: body → existing row → default 'ios'.
  let platform = body.platform?.trim();
  if (!platform || !["ios", "android", "web"].includes(platform)) {
    const existing = (await sql(
      `SELECT platform FROM push_devices WHERE token = $1`,
      [token],
    )) as Array<{ platform: string }>;
    platform = existing[0]?.platform ?? "ios";
  }

  if (subscribe) {
    // Upsert: insert a new row with {stationId}, or append to existing row.
    await sql(
      `INSERT INTO push_devices (token, platform, station_ids)
       VALUES ($1, $2, ARRAY[$3]::TEXT[])
       ON CONFLICT (token) DO UPDATE
         SET station_ids = array_append(
               array_remove(push_devices.station_ids, $3), $3
             ),
             active     = true,
             updated_at = now()`,
      [token, platform, stationId],
    );
  } else {
    // Only makes sense if the row exists; if not, nothing to remove.
    await sql(
      `UPDATE push_devices
         SET station_ids = array_remove(station_ids, $2),
             updated_at  = now()
       WHERE token = $1 AND active = true`,
      [token, stationId],
    );
  }

  return Response.json({ success: true });
}
