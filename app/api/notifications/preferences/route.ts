import { NextRequest } from "next/server";

import { sql } from "@/lib/db/client";
import { SubscriberPreferencesSchema } from "@/lib/domain/notification";

/**
 * GET /api/notifications/preferences?token=xxx or ?pushToken=xxx
 *
 * Returns current preferences for subscriber or push-only device.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const pushToken = request.nextUrl.searchParams.get("pushToken");

  if (token) {
    const rows = await sql(
      `SELECT preferences FROM subscribers WHERE token = $1 AND confirmed = true`,
      [token],
    );
    if (rows.length === 0) {
      return Response.json({ error: "Invalid or unconfirmed token" }, { status: 404 });
    }
    return Response.json({ preferences: rows[0].preferences ?? {} });
  }

  if (pushToken) {
    const rows = await sql(
      `SELECT preferences, subscriber_id FROM push_devices WHERE token = $1 AND active = true`,
      [pushToken],
    );
    if (rows.length === 0) {
      return Response.json({ preferences: {} });
    }
    // If linked to a subscriber, merge subscriber prefs as base
    const device = rows[0];
    let prefs = device.preferences ?? {};
    if (device.subscriber_id) {
      const subRows = await sql(
        `SELECT preferences FROM subscribers WHERE id = $1`,
        [device.subscriber_id],
      );
      if (subRows.length > 0) {
        prefs = { ...subRows[0].preferences, ...prefs };
      }
    }
    return Response.json({ preferences: prefs });
  }

  return Response.json({ error: "token or pushToken required" }, { status: 400 });
}

/**
 * PATCH /api/notifications/preferences?token=xxx or ?pushToken=xxx
 *
 * Body: { global?: Partial<Preferences>, stations?: Record<stationId, Partial<Preferences>> }
 */
export async function PATCH(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const pushToken = request.nextUrl.searchParams.get("pushToken");

  if (!token && !pushToken) {
    return Response.json({ error: "token or pushToken required" }, { status: 400 });
  }

  const body = (await request.json()) as {
    global?: Record<string, unknown>;
    stations?: Record<string, Record<string, unknown>>;
  };

  // --- Subscriber path ---
  if (token) {
    const subscribers = (await sql(
      `SELECT id FROM subscribers WHERE token = $1 AND confirmed = true`,
      [token],
    )) as Array<{ id: string }>;

    if (subscribers.length === 0) {
      return Response.json({ error: "Invalid or unconfirmed token" }, { status: 404 });
    }

    const subscriberId = subscribers[0].id;

    if (body.global) {
      const partial = SubscriberPreferencesSchema.partial().safeParse(body.global);
      if (!partial.success) {
        return Response.json(
          { error: "Invalid preferences", details: partial.error.issues },
          { status: 400 },
        );
      }

      await sql(
        `UPDATE subscribers
         SET preferences = preferences || $1::jsonb, updated_at = now()
         WHERE id = $2`,
        [JSON.stringify(partial.data), subscriberId],
      );

      // Also update linked push devices so push + email stay consistent
      await sql(
        `UPDATE push_devices
         SET preferences = preferences || $1::jsonb, updated_at = now()
         WHERE subscriber_id = $2 AND active = true`,
        [JSON.stringify(partial.data), subscriberId],
      );
    }

    if (body.stations) {
      for (const [stationId, prefs] of Object.entries(body.stations)) {
        const partial = SubscriberPreferencesSchema.partial().safeParse(prefs);
        if (!partial.success) continue;

        await sql(
          `UPDATE subscriptions
           SET preferences = COALESCE(preferences, '{}'::jsonb) || $1::jsonb
           WHERE subscriber_id = $2 AND station_id = $3`,
          [JSON.stringify(partial.data), subscriberId, stationId],
        );
      }
    }

    return Response.json({ success: true });
  }

  // --- Push-only path ---
  if (pushToken) {
    if (body.global) {
      const partial = SubscriberPreferencesSchema.partial().safeParse(body.global);
      if (!partial.success) {
        return Response.json(
          { error: "Invalid preferences", details: partial.error.issues },
          { status: 400 },
        );
      }

      const rows = await sql(
        `UPDATE push_devices
         SET preferences = preferences || $1::jsonb, updated_at = now()
         WHERE token = $2 AND active = true
         RETURNING subscriber_id`,
        [JSON.stringify(partial.data), pushToken],
      );

      // If linked to a subscriber, also update subscriber prefs
      if (rows.length > 0 && rows[0].subscriber_id) {
        await sql(
          `UPDATE subscribers
           SET preferences = preferences || $1::jsonb, updated_at = now()
           WHERE id = $2`,
          [JSON.stringify(partial.data), rows[0].subscriber_id],
        );
      }
    }

    return Response.json({ success: true });
  }

  return Response.json({ error: "token or pushToken required" }, { status: 400 });
}
