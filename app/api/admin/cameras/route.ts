import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";
import { createSpypointClient } from "@/lib/skypoint/client";

interface LocalCameraRow {
  id: string;
  provider: string;
  provider_camera_id: string | null;
  provider_account_id: string | null;
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
         c.provider,
         c.provider_camera_id,
         c.provider_account_id,
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
  let remoteSpypoint: Array<{ id: string; name: string; model: string | null; isOnline: boolean }> = [];
  let spypointError: string | null = null;
  try {
    const client = createSpypointClient();
    const cameras = await client.getCameras();
    remoteSpypoint = cameras.map((c) => ({ id: c.id, name: c.name, model: c.model, isOnline: c.isOnline }));
  } catch (err) {
    spypointError = err instanceof Error ? err.message : "Spypoint API error";
  }

  const localKeys = new Set(local.map((c) => `${c.provider}:${c.provider_camera_id ?? ""}`));
  const unassignedSpypoint = remoteSpypoint.filter((c) => !localKeys.has(`spypoint:${c.id}`));

  return Response.json({
    local,
    unassignedSpypoint,
    spypointError,
    // The remote-Blink list isn't here because it's per-account; the admin
    // UI fetches it from /api/admin/cameras/blink/accounts/[id] when the
    // admin expands an account.
  });
}

interface PostBody {
  provider?: string;
  providerCameraId?: string;
  // Spypoint legacy field — accepted as an alias for providerCameraId so
  // existing UI keeps working during the rollout.
  spypointCameraId?: string;
  providerAccountId?: string | null;
  name?: string;
}

export async function POST(req: NextRequest) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const provider = (body.provider ?? "spypoint").trim();
  if (provider !== "spypoint" && provider !== "blink") {
    return Response.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
  }

  const providerCameraId = (body.providerCameraId ?? body.spypointCameraId)?.trim();
  if (!providerCameraId) {
    return Response.json({ error: "providerCameraId is required" }, { status: 400 });
  }

  let name = body.name?.trim();
  if (!name) {
    if (provider === "spypoint") {
      try {
        const client = createSpypointClient();
        const cameras = await client.getCameras();
        const remote = cameras.find((c) => c.id === providerCameraId);
        name = remote?.name ?? providerCameraId;
      } catch {
        name = providerCameraId;
      }
    } else {
      name = providerCameraId;
    }
  }

  const providerAccountId = body.providerAccountId ?? null;
  const legacySpypointId = provider === "spypoint" ? providerCameraId : null;

  try {
    const rows = (await sql(
      `INSERT INTO cameras (provider, provider_camera_id, provider_account_id, spypoint_camera_id, name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider, provider_camera_id) WHERE provider_camera_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [provider, providerCameraId, providerAccountId, legacySpypointId, name],
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
