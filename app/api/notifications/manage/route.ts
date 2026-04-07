import { NextRequest } from "next/server";

import { sql } from "@/lib/db/client";

/**
 * GET /api/notifications/manage?token=xxx
 *
 * Returns subscriber data, subscriptions, preferences, and recent notifications.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return Response.json({ error: "Token required" }, { status: 400 });
  }

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
