import { NextRequest } from "next/server";

import { sql } from "@/lib/db/client";

/**
 * GET /api/notifications/confirm?token=xxx
 *
 * Confirms a subscriber's email and redirects to the app.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return Response.json({ error: "Token required" }, { status: 400 });
  }

  const rows = (await sql(
    `UPDATE subscribers
     SET confirmed = true, confirmed_at = now(), updated_at = now()
     WHERE token = $1 AND confirmed = false
     RETURNING id, email`,
    [token],
  )) as Array<{ id: string; email: string }>;

  // Even if already confirmed, redirect gracefully
  if (rows.length === 0) {
    // Check if token exists but was already confirmed
    const existing = (await sql(
      `SELECT id, confirmed FROM subscribers WHERE token = $1`,
      [token],
    )) as Array<{ id: string; confirmed: boolean }>;

    if (existing.length === 0) {
      return Response.json({ error: "Invalid token" }, { status: 404 });
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const redirectUrl = `${appUrl}/notifications/confirmed?token=${token}`;

  return Response.redirect(redirectUrl, 302);
}
