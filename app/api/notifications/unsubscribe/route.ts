import { NextRequest } from "next/server";

import { sql } from "@/lib/db/client";

/**
 * DELETE /api/notifications/unsubscribe?token=xxx&stationId=xxx
 *
 * Removes a subscription (or all subscriptions if no stationId).
 * Also works as GET for email unsubscribe link compatibility.
 */
export async function DELETE(request: NextRequest) {
  return handleUnsubscribe(request);
}

export async function GET(request: NextRequest) {
  return handleUnsubscribe(request);
}

async function handleUnsubscribe(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return Response.json({ error: "Token required" }, { status: 400 });
  }

  const subscribers = (await sql(
    `SELECT id FROM subscribers WHERE token = $1`,
    [token],
  )) as Array<{ id: string }>;

  if (subscribers.length === 0) {
    return Response.json({ error: "Invalid token" }, { status: 404 });
  }

  const subscriberId = subscribers[0].id;
  const stationId = request.nextUrl.searchParams.get("stationId");

  if (stationId) {
    // Deactivate specific subscription
    await sql(
      `UPDATE subscriptions SET active = false WHERE subscriber_id = $1 AND station_id = $2`,
      [subscriberId, stationId],
    );
  } else {
    // Deactivate all subscriptions
    await sql(
      `UPDATE subscriptions SET active = false WHERE subscriber_id = $1`,
      [subscriberId],
    );
  }

  // If this came from an email link (GET), redirect to a friendly page
  if (request.method === "GET") {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    return Response.redirect(`${appUrl}/?unsubscribed=1`, 302);
  }

  return Response.json({ success: true });
}
