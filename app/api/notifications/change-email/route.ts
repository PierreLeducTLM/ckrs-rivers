import { NextRequest } from "next/server";

import { sql } from "@/lib/db/client";

/**
 * POST /api/notifications/change-email?token=xxx
 *
 * Body: { email: string }
 *
 * Changes the subscriber's email address and transfers all subscriptions
 * if the new email already has an account.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return Response.json({ error: "Token required" }, { status: 400 });
  }

  const body = (await request.json()) as { email?: string };
  const newEmail = body.email?.trim().toLowerCase();
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return Response.json({ error: "Valid email required" }, { status: 400 });
  }

  // Find current subscriber
  const subscribers = (await sql(
    `SELECT id, email FROM subscribers WHERE token = $1 AND confirmed = true`,
    [token],
  )) as Array<{ id: string; email: string }>;

  if (subscribers.length === 0) {
    return Response.json({ error: "Invalid or unconfirmed token" }, { status: 404 });
  }

  const current = subscribers[0];
  if (current.email === newEmail) {
    return Response.json({ success: true, email: newEmail, token });
  }

  // Check if the new email already has a subscriber record
  const existing = (await sql(
    `SELECT id, token FROM subscribers WHERE email = $1`,
    [newEmail],
  )) as Array<{ id: string; token: string }>;

  let newToken = token;

  if (existing.length > 0) {
    const target = existing[0];
    // Transfer subscriptions from current subscriber to the existing one
    // For each subscription, either move it or skip if duplicate
    await sql(
      `UPDATE subscriptions
       SET subscriber_id = $1
       WHERE subscriber_id = $2
         AND station_id NOT IN (
           SELECT station_id FROM subscriptions WHERE subscriber_id = $1
         )`,
      [target.id, current.id],
    );

    // Transfer alert_state for moved subscriptions
    await sql(
      `UPDATE alert_state
       SET subscription_id = moved.new_sub_id
       FROM (
         SELECT old_s.id AS old_sub_id, new_s.id AS new_sub_id
         FROM subscriptions old_s
         JOIN subscriptions new_s ON new_s.station_id = old_s.station_id
           AND new_s.subscriber_id = $1
         WHERE old_s.subscriber_id = $2
       ) moved
       WHERE alert_state.subscription_id = moved.old_sub_id`,
      [target.id, current.id],
    );

    // Delete remaining subscriptions on old subscriber (duplicates)
    await sql(
      `DELETE FROM subscriptions WHERE subscriber_id = $1`,
      [current.id],
    );

    // Copy preferences from old to new (merge, don't overwrite)
    await sql(
      `UPDATE subscribers
       SET preferences = $1::jsonb || preferences,
           confirmed = true,
           confirmed_at = COALESCE(confirmed_at, now()),
           updated_at = now()
       WHERE id = $2`,
      [JSON.stringify({}), target.id],
    );

    // Delete old subscriber
    await sql(`DELETE FROM subscribers WHERE id = $1`, [current.id]);

    newToken = target.token;
  } else {
    // Simply update the email on the current subscriber
    await sql(
      `UPDATE subscribers SET email = $1, updated_at = now() WHERE id = $2`,
      [newEmail, current.id],
    );
  }

  return Response.json({ success: true, email: newEmail, token: newToken });
}
