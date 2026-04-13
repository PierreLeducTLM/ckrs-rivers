import { NextRequest } from "next/server";

import { sql } from "@/lib/db/client";

/**
 * GET /api/notifications/manage?token=xxx       (subscriber)
 * GET /api/notifications/manage?pushToken=xxx   (push-only device)
 *
 * Returns subscriber/device data, subscriptions, preferences, and recent notifications.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const pushToken = request.nextUrl.searchParams.get("pushToken");

  if (!token && !pushToken) {
    return Response.json({ error: "token or pushToken required" }, { status: 400 });
  }

  // --- Subscriber path (existing) ---
  if (token) {
    const subscribers = (await sql(
      `SELECT id, email, confirmed, preferences, created_at
       FROM subscribers WHERE token = $1`,
      [token],
    )) as Array<{
      id: string;
      email: string;
      confirmed: boolean;
      preferences: Record<string, unknown>;
      created_at: string;
    }>;

    if (subscribers.length === 0) {
      return Response.json({ error: "Invalid token" }, { status: 404 });
    }

    const subscriber = subscribers[0];

    const subscriptions = (await sql(
      `SELECT s.id, s.station_id, s.active, s.preferences, st.name as station_name
       FROM subscriptions s
       JOIN stations st ON st.id = s.station_id
       WHERE s.subscriber_id = $1
       ORDER BY st.name`,
      [subscriber.id],
    )) as Array<{
      id: string;
      station_id: string;
      active: boolean;
      preferences: Record<string, unknown> | null;
      station_name: string;
    }>;

    const notifications = (await sql(
      `SELECT n.alert_type, n.priority, n.subject, n.sent_at, n.delivered,
              st.name as station_name
       FROM notification_log n
       LEFT JOIN stations st ON st.id = n.station_id
       WHERE n.subscriber_id = $1
       ORDER BY n.created_at DESC
       LIMIT 20`,
      [subscriber.id],
    )) as Array<{
      alert_type: string;
      priority: string;
      subject: string;
      sent_at: string | null;
      delivered: boolean | null;
      station_name: string | null;
    }>;

    return Response.json({
      email: subscriber.email,
      confirmed: subscriber.confirmed,
      preferences: subscriber.preferences,
      memberSince: subscriber.created_at,
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        stationId: s.station_id,
        stationName: s.station_name,
        active: s.active,
        preferences: s.preferences,
      })),
      recentNotifications: notifications,
    });
  }

  // --- Push-only path ---
  if (pushToken) {
    const devices = (await sql(
      `SELECT id, station_ids, preferences, subscriber_id
       FROM push_devices WHERE token = $1 AND active = true`,
      [pushToken],
    )) as Array<{
      id: string;
      station_ids: string[];
      preferences: Record<string, unknown>;
      subscriber_id: string | null;
    }>;

    if (devices.length === 0) {
      return Response.json({
        email: null,
        preferences: {},
        stationIds: [],
      });
    }

    const device = devices[0];
    let prefs = device.preferences ?? {};

    // If linked to subscriber, merge subscriber prefs as base
    let email: string | null = null;
    if (device.subscriber_id) {
      const subRows = await sql(
        `SELECT email, preferences FROM subscribers WHERE id = $1`,
        [device.subscriber_id],
      );
      if (subRows.length > 0) {
        email = subRows[0].email;
        prefs = { ...subRows[0].preferences, ...prefs };
      }
    }

    // Resolve station names for station_ids
    const stationIds = device.station_ids ?? [];
    let stationNames: Array<{ id: string; name: string }> = [];
    if (stationIds.length > 0) {
      stationNames = (await sql(
        `SELECT id, name FROM stations WHERE id = ANY($1)`,
        [stationIds],
      )) as Array<{ id: string; name: string }>;
    }

    return Response.json({
      email,
      preferences: prefs,
      stationIds,
      stations: stationNames.map((s) => ({ stationId: s.id, stationName: s.name })),
    });
  }

  return Response.json({ error: "token or pushToken required" }, { status: 400 });
}
