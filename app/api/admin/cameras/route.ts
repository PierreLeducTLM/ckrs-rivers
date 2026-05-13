import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";
import { createSpypointClient } from "@/lib/skypoint/client";

interface LocalCameraRow {
  id: string;
  spypoint_camera_id: string;
  name: string;
  station_id: string | null;
  active: boolean;
  last_synced_photo_date: string | null;
  latest_reading_value: number | null;
  latest_reading_confidence: string | null;
  latest_captured_at: string | null;
  station_name: string | null;
}

export async function GET() {
  let local: LocalCameraRow[] = [];
  try {
    local = (await sql(
      `SELECT
         c.id,
         c.spypoint_camera_id,
         c.name,
         c.station_id,
         c.active,
         c.last_synced_photo_date::text AS last_synced_photo_date,
         s.name AS station_name,
         latest.reading_value AS latest_reading_value,
         latest.reading_confidence AS latest_reading_confidence,
         latest.captured_at::text AS latest_captured_at
       FROM cameras c
       LEFT JOIN stations s ON s.id = c.station_id
       LEFT JOIN LATERAL (
         SELECT reading_value, reading_confidence, captured_at
         FROM camera_images
         WHERE camera_id = c.id
         ORDER BY captured_at DESC
         LIMIT 1
       ) latest ON true
       ORDER BY c.created_at DESC`,
    )) as LocalCameraRow[];
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "DB error" },
      { status: 500 },
    );
  }

  // Try to enumerate Spypoint cameras so admin can import new ones.
  // Tolerate failure (missing creds, network) — just return local list.
  let remote: Array<{ id: string; name: string; model: string | null; isOnline: boolean }> = [];
  let remoteError: string | null = null;
  try {
    const client = createSpypointClient();
    const cameras = await client.getCameras();
    remote = cameras.map((c) => ({ id: c.id, name: c.name, model: c.model, isOnline: c.isOnline }));
  } catch (err) {
    remoteError = err instanceof Error ? err.message : "Spypoint API error";
  }

  const localIds = new Set(local.map((c) => c.spypoint_camera_id));
  const unassigned = remote.filter((c) => !localIds.has(c.id));

  return Response.json({ local, unassigned, remoteError });
}

export async function POST(req: NextRequest) {
  let body: { spypointCameraId?: string; name?: string };
  try {
    body = (await req.json()) as { spypointCameraId?: string; name?: string };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const spypointCameraId = body.spypointCameraId?.trim();
  if (!spypointCameraId) {
    return Response.json({ error: "spypointCameraId is required" }, { status: 400 });
  }

  // Fetch the camera name from Spypoint so admin doesn't have to type it.
  let name = body.name?.trim();
  if (!name) {
    try {
      const client = createSpypointClient();
      const cameras = await client.getCameras();
      const remote = cameras.find((c) => c.id === spypointCameraId);
      name = remote?.name ?? spypointCameraId;
    } catch {
      name = spypointCameraId;
    }
  }

  try {
    const rows = (await sql(
      `INSERT INTO cameras (spypoint_camera_id, name)
       VALUES ($1, $2)
       ON CONFLICT (spypoint_camera_id) DO NOTHING
       RETURNING id`,
      [spypointCameraId, name],
    )) as Array<{ id: string }>;

    if (rows.length === 0) {
      return Response.json({ error: "Camera already imported" }, { status: 409 });
    }
    return Response.json({ success: true, id: rows[0].id });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Insert failed" },
      { status: 500 },
    );
  }
}
