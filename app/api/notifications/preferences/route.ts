import { NextRequest } from "next/server";

import { sql } from "@/lib/db/client";
import { SubscriberPreferencesSchema } from "@/lib/domain/notification";

/**
 * PATCH /api/notifications/preferences?token=xxx[&pushToken=yyy]
 *
 * Body: { global?: Partial<Preferences>, stations?: Record<stationId, Partial<Preferences>> }
 *
 * Either `token` (subscriber token) or `pushToken` (push device token) must be provided.
 * If a push device is linked to a subscriber, both locations are kept in sync when
 * updating via the subscriber token. When updating via pushToken, only the device row
 * is touched (device-level override).
 */
export async function PATCH(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const pushToken = request.nextUrl.searchParams.get("pushToken");

  if (!token && !pushToken) {
    return Response.json(
      { error: "token or pushToken required" },
      { status: 400 },
    );
  }

  const body = (await request.json()) as {
    global?: Record<string, unknown>;
    stations?: Record<string, Record<string, unknown>>;
  };

  // Validate global prefs once
  let validatedGlobal: Record<string, unknown> | null = null;
  if (body.global) {
    const partial = SubscriberPreferencesSchema.partial().safeParse(body.global);
    if (!partial.success) {
      return Response.json(
        { error: "Invalid preferences", details: partial.error.issues },
        { status: 400 },
      );
    }
    validatedGlobal = partial.data;
  }

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

    if (validatedGlobal) {
      await sql(
        `UPDATE subscribers
         SET preferences = preferences || $1::jsonb, updated_at = now()
         WHERE id = $2`,
        [JSON.stringify(validatedGlobal), subscriberId],
      );

      // Mirror to any linked push devices so push filtering honors the update.
      await sql(
        `UPDATE push_devices
         SET preferences = preferences || $1::jsonb, updated_at = now()
         WHERE subscriber_id = $2`,
        [JSON.stringify(validatedGlobal), subscriberId],
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
  const rows = (await sql(
    `SELECT id FROM push_devices WHERE token = $1 AND active = true`,
    [pushToken],
  )) as Array<{ id: string }>;

  if (rows.length === 0) {
    return Response.json({ error: "Unknown pushToken" }, { status: 404 });
  }

  if (validatedGlobal) {
    await sql(
      `UPDATE push_devices
       SET preferences = preferences || $1::jsonb, updated_at = now()
       WHERE token = $2`,
      [JSON.stringify(validatedGlobal), pushToken],
    );
  }

  // Per-station preferences aren't supported for push-only users (no subscriptions row).
  return Response.json({ success: true });
}
