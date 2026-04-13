import { NextRequest } from "next/server";

import { sql } from "@/lib/db/client";
import { confirmationEmail } from "@/lib/notifications/email-templates";
import { sendEmail } from "@/lib/notifications/send-email";

/**
 * POST /api/notifications/subscribe
 *
 * Body: { email: string, pushToken?: string }
 *
 * Creates or finds a subscriber.
 *
 * - Web flow: sends a confirmation email; user must click the link.
 * - Native flow (pushToken provided): trusts the device identity, marks the
 *   subscriber as confirmed, links the push device to the subscriber, and
 *   returns the subscriber token so the client can immediately manage prefs.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { email?: string; pushToken?: string };

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Valid email required" }, { status: 400 });
  }

  const pushToken = body.pushToken?.trim();

  // Upsert subscriber. Auto-confirm when the request originates from a
  // trusted native device that already has a push_devices row.
  const autoConfirm = !!pushToken;

  const subscribers = autoConfirm
    ? ((await sql(
        `INSERT INTO subscribers (email, confirmed, confirmed_at)
         VALUES ($1, true, now())
         ON CONFLICT (email) DO UPDATE
           SET confirmed    = true,
               confirmed_at = COALESCE(subscribers.confirmed_at, now()),
               updated_at   = now()
         RETURNING id, token, confirmed`,
        [email],
      )) as Array<{ id: string; token: string; confirmed: boolean }>)
    : ((await sql(
        `INSERT INTO subscribers (email)
         VALUES ($1)
         ON CONFLICT (email) DO UPDATE SET updated_at = now()
         RETURNING id, token, confirmed`,
        [email],
      )) as Array<{ id: string; token: string; confirmed: boolean }>);

  const subscriber = subscribers[0];

  // Native flow: link push device → subscriber and return token immediately.
  if (pushToken) {
    await sql(
      `UPDATE push_devices
       SET subscriber_id = $1, updated_at = now()
       WHERE token = $2`,
      [subscriber.id, pushToken],
    );

    return Response.json({
      success: true,
      token: subscriber.token,
      email,
      alreadyConfirmed: subscriber.confirmed,
    });
  }

  // Web flow: send confirmation email.
  const template = confirmationEmail(subscriber.token);
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
