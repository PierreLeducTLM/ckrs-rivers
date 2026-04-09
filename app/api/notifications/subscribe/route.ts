import { NextRequest } from "next/server";

import { sql } from "@/lib/db/client";
import { confirmationEmail } from "@/lib/notifications/email-templates";
import { sendEmail } from "@/lib/notifications/send-email";

/**
 * POST /api/notifications/subscribe
 *
 * Body: { email: string }
 * Creates or finds subscriber and sends a confirmation email.
 * No rivers are subscribed at this stage — the user selects rivers
 * after confirming their email.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { email?: string };

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Valid email required" }, { status: 400 });
  }

  // Upsert subscriber
  const subscribers = (await sql(
    `INSERT INTO subscribers (email)
     VALUES ($1)
     ON CONFLICT (email) DO UPDATE SET updated_at = now()
     RETURNING id, token, confirmed`,
    [email],
  )) as Array<{ id: string; token: string; confirmed: boolean }>;

  const subscriber = subscribers[0];

  // Send confirmation email
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
