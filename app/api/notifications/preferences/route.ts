import { NextRequest } from "next/server";

import { sql } from "@/lib/db/client";
import { SubscriberPreferencesSchema } from "@/lib/domain/notification";

/**
 * PATCH /api/notifications/preferences?token=xxx
 *
 * Body: { global?: Partial<Preferences>, stations?: Record<stationId, Partial<Preferences>> }
 */
export async function PATCH(request: NextRequest) {
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

  const subscriberId = subscribers[0].id;

  const body = (await request.json()) as {
    global?: Record<string, unknown>;
    stations?: Record<string, Record<string, unknown>>;
  };

  // Update global preferences
  if (body.global) {
    // Validate partial preferences (allow partial by picking only known keys)
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
  }

  // Update per-station preferences
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
