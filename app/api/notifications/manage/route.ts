import { NextRequest } from "next/server";

import { sql } from "@/lib/db/client";

/**
 * GET /api/notifications/manage?token=xxx[&pushToken=yyy]
 *
 * Returns subscriber data, subscriptions, preferences, and recent notifications.
 *
 * If only `pushToken` is supplied (no subscriber), returns a push-only payload:
 *   { email: null, confirmed: false, preferences, memberSince, subscriptions: [], recentNotifications: [] }
 *
 * If both `token` and `pushToken` are supplied, the subscriber response is returned
 * with an extra `pushDevice` field merging the device's station_ids/preferences.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const pushToken = request.nextUrl.searchParams.get("pushToken");

  if (!token && !pushToken) {
    return Response.json({ error: "token or pushToken required" }, { status: 400 });
  }

  // --- Push-only path ---
  if (!token && pushToken) {
    const devices = (await sql(
      `SELECT id, token, platform, station_ids, subscriber_id, preferences, created_at
         FROM push_devices
        WHERE token = $1 AND active = true`,
      [pushToken],
    )) as Array<{
      id: string;
      token: string;
      platform: string;
      station_ids: string[] | null;
      subscriber_id: string | null;
      preferences: Record<string, unknown> | null;
      created_at: string;
    }>;

    if (devices.length === 0) {
      return Response.json({ error: "Unknown pushToken" }, { status: 404 });
    }

    const device = devices[0];

    // If the device is linked to a subscriber, fold in that subscriber's data too.
    if (device.subscriber_id) {
      const subs = (await sql(
        `SELECT email, confirmed, preferences, created_at, token
           FROM subscribers WHERE id = $1`,
        [device.subscriber_id],
      )) as Array<{
        email: string;
        confirmed: boolean;
        preferences: Record<string, unknown>;
        created_at: string;
        token: string;
      }>;

      if (subs.length > 0) {
        const sub = subs[0];
        return Response.json({
          email: sub.email,
          confirmed: sub.confirmed,
          subscriberToken: sub.token,
          // Device prefs override subscriber prefs (local mute-on-device semantics).
          preferences: { ...sub.preferences, ...(device.preferences ?? {}) },
          memberSince: sub.created_at,
          subscriptions: [],
          recentNotifications: [],
          pushDevice: {
            platform: device.platform,
            stationIds: device.station_ids ?? [],
          },
        });
      }
    }

    return Response.json({
      email: null,
      confirmed: false,
      preferences: device.preferences ?? {},
      memberSince: device.created_at,
      subscriptions: [],
      recentNotifications: [],
      pushDevice: {
        platform: device.platform,
        stationIds: device.station_ids ?? [],
      },
    });
  }

  // --- Subscriber path (original) ---
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

  // Get subscriptions with station names
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

  // Get recent notifications
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

  // If the caller also provided a pushToken, link the device to this subscriber
  // so prefs + push dispatch stay in sync.
  let pushDevice: { platform: string; stationIds: string[] } | null = null;
  if (pushToken) {
    await sql(
      `UPDATE push_devices
       SET subscriber_id = $1, updated_at = now()
       WHERE token = $2 AND active = true`,
      [subscriber.id, pushToken],
    );

    const devices = (await sql(
      `SELECT platform, station_ids FROM push_devices WHERE token = $1 AND active = true`,
      [pushToken],
    )) as Array<{ platform: string; station_ids: string[] | null }>;
    if (devices.length > 0) {
      pushDevice = {
        platform: devices[0].platform,
        stationIds: devices[0].station_ids ?? [],
      };
    }
  }

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
    ...(pushDevice ? { pushDevice } : {}),
  });
}
