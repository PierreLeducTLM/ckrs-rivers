import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";
import { deleteCameraImages } from "@/lib/storage/blob";

interface CameraDetailRow {
  id: string;
  provider: string;
  provider_camera_id: string | null;
  provider_account_id: string | null;
  name: string;
  station_id: string | null;
  scale_description: string | null;
  scale_min: number | null;
  scale_max: number | null;
  scale_unit: string | null;
  paddling_min_reading: number | null;
  paddling_ideal_reading: number | null;
  paddling_max_reading: number | null;
  active: boolean;
  last_synced_photo_date: string | null;
}

interface ImageRow {
  id: string;
  captured_at: string;
  blob_url: string;
  reading_value: number | null;
  reading_confidence: string | null;
  reading_source: string;
  reading_notes: string | null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const cameras = (await sql(
    `SELECT id, provider, provider_camera_id, provider_account_id,
            name, station_id,
            scale_description, scale_min, scale_max, scale_unit,
            paddling_min_reading, paddling_ideal_reading, paddling_max_reading,
            active, last_synced_photo_date::text AS last_synced_photo_date
     FROM cameras WHERE id = $1`,
    [id],
  )) as CameraDetailRow[];
  if (cameras.length === 0) return Response.json({ error: "Camera not found" }, { status: 404 });

  const images = (await sql(
    `SELECT id, captured_at::text AS captured_at, blob_url,
            reading_value, reading_confidence, reading_source, reading_notes
     FROM camera_images
     WHERE camera_id = $1
     ORDER BY captured_at DESC
     LIMIT 12`,
    [id],
  )) as ImageRow[];

  return Response.json({ camera: cameras[0], images });
}

interface PatchBody {
  name?: string | null;
  stationId?: string | null;
  scaleDescription?: string | null;
  scaleMin?: number | null;
  scaleMax?: number | null;
  scaleUnit?: string | null;
  paddlingMinReading?: number | null;
  paddlingIdealReading?: number | null;
  paddlingMaxReading?: number | null;
  active?: boolean;
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fields: string[] = [];
  const params: unknown[] = [];
  const setField = (col: string, val: unknown) => {
    params.push(val);
    fields.push(`${col} = $${params.length}`);
  };

  if (body.name !== undefined) setField("name", strOrNull(body.name) ?? id);
  if (body.stationId !== undefined) setField("station_id", strOrNull(body.stationId));
  if (body.scaleDescription !== undefined) setField("scale_description", strOrNull(body.scaleDescription));
  if (body.scaleMin !== undefined) setField("scale_min", numOrNull(body.scaleMin));
  if (body.scaleMax !== undefined) setField("scale_max", numOrNull(body.scaleMax));
  if (body.scaleUnit !== undefined) setField("scale_unit", strOrNull(body.scaleUnit));
  if (body.paddlingMinReading !== undefined) setField("paddling_min_reading", numOrNull(body.paddlingMinReading));
  if (body.paddlingIdealReading !== undefined) setField("paddling_ideal_reading", numOrNull(body.paddlingIdealReading));
  if (body.paddlingMaxReading !== undefined) setField("paddling_max_reading", numOrNull(body.paddlingMaxReading));
  if (body.active !== undefined) setField("active", !!body.active);

  if (fields.length === 0) return Response.json({ success: true, noop: true });

  fields.push(`updated_at = now()`);
  params.push(id);

  try {
    await sql(
      `UPDATE cameras SET ${fields.join(", ")} WHERE id = $${params.length}`,
      params,
    );
    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const blobs = (await sql(
      `SELECT blob_url FROM camera_images WHERE camera_id = $1`,
      [id],
    )) as Array<{ blob_url: string }>;

    // CASCADE drops the camera_images rows; clean up the Vercel Blob storage
    // best-effort so we don't orphan files.
    await sql(`DELETE FROM cameras WHERE id = $1`, [id]);

    if (blobs.length > 0) {
      try {
        await deleteCameraImages(blobs.map((b) => b.blob_url));
      } catch {
        // Storage cleanup is non-fatal; the camera is already gone from the DB.
      }
    }

    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 500 },
    );
  }
}
