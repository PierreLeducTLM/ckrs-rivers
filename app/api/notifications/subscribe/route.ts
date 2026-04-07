import { NextRequest } from "next/server";

import { sql } from "@/lib/db/client";
import { confirmationEmail } from "@/lib/notifications/email-templates";
import { sendEmail } from "@/lib/notifications/send-email";

/**
 * POST /api/notifications/subscribe
 *
 * Body: { email: string, stationIds?: string[] }
 * Creates or finds subscriber, creates subscriptions, sends confirmation.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    email?: string;
    stationIds?: string[];
  };

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Valid email required" }, { status: 400 });
  }

  const stationIds = body.stationIds ?? [];

  // Upsert subscriber
  const subscribers = (await sql(
    `INSERT INTO subscribers (email)
     VALUES ($1)
     ON CONFLICT (email) DO UPDATE SET updated_at = now()
     RETURNING id, token, confirmed`,
    [email],
  )) as Array<{ id: string; token: string; confirmed: boolean }>;

  const subscriber = subscribers[0];

  // Create subscriptions for requested stations
  const stationNames: string[] = [];
  for (const stationId of stationIds) {
    // Verify station exists
    const stations = (await sql(
      `SELECT id, name FROM stations WHERE id = $1`,
      [stationId],
    )) as Array<{ id: string; name: string }>;

    if (stations.length === 0) continue;

    stationNames.push(stations[0].name);

    await sql(
      `INSERT INTO subscriptions (subscriber_id, station_id)
       VALUES ($1, $2)
       ON CONFLICT (subscriber_id, station_id) DO UPDATE SET active = true`,
      [subscriber.id, stationId],
    );
  }

  // Send confirmation email (even if already confirmed, re-send as a "manage" reminder)
  const template = confirmationEmail(subscriber.token, stationNames);
  const result = await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
  });

  if (!result.success) {
    console.error("Failed to send confirmation email:", result.error);
    return Response.json(
      { error: "Failed to send confirmation email" },
      { status: 500 },
    );
  }

  return Response.json({
    success: true,
    message: "Check your email to confirm your subscription",
    alreadyConfirmed: subscriber.confirmed,
  });
}
