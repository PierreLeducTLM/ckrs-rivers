import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";

/**
 * POST /api/notifications/push-register
 *
 * Body: { token: string, platform: 'ios' | 'android' | 'web', stationIds?: string[] }
 * Registers or updates a device push token.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    token?: string;
    platform?: string;
    stationIds?: string[];
  };

  const token = body.token?.trim();
  const platform = body.platform?.trim();

  if (!token || !platform) {
    return Response.json(
      { error: "token and platform are required" },
      { status: 400 },
    );
  }

  if (!["ios", "android", "web"].includes(platform)) {
    return Response.json(
      { error: "platform must be ios, android, or web" },
      { status: 400 },
    );
  }

  const stationIds = body.stationIds ?? [];

  await sql(
    `INSERT INTO push_devices (token, platform, station_ids)
     VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE
       SET platform = EXCLUDED.platform,
           station_ids = EXCLUDED.station_ids,
           active = true,
           updated_at = now()`,
    [token, platform, stationIds],
  );

  return Response.json({ success: true });
}
