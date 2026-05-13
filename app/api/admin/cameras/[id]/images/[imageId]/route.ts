import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";
import { readLevel } from "@/lib/skypoint/read-level";

interface ImageRow {
  id: string;
  camera_id: string;
  blob_url: string;
}

interface CameraRow {
  scale_description: string | null;
  scale_min: number | null;
  scale_max: number | null;
  scale_unit: string | null;
}

interface PatchBody {
  readingValue?: number | string | null;
  notes?: string | null;
  rerun?: boolean;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; imageId: string }> },
) {
  const { id: cameraId, imageId } = await ctx.params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const images = (await sql(
    `SELECT id, camera_id, blob_url FROM camera_images WHERE id = $1 AND camera_id = $2`,
    [imageId, cameraId],
  )) as ImageRow[];
  if (images.length === 0) return Response.json({ error: "Image not found" }, { status: 404 });

  if (body.rerun) {
    const cams = (await sql(
      `SELECT scale_description, scale_min, scale_max, scale_unit FROM cameras WHERE id = $1`,
      [cameraId],
    )) as CameraRow[];
    if (cams.length === 0) return Response.json({ error: "Camera not found" }, { status: 404 });
    const cam = cams[0];

    const reading = await readLevel({
      imageUrl: images[0].blob_url,
      scaleDescription: cam.scale_description,
      scaleMin: cam.scale_min,
      scaleMax: cam.scale_max,
      scaleUnit: cam.scale_unit,
    });

    await sql(
      `UPDATE camera_images
       SET reading_value = $1, reading_confidence = $2, reading_source = 'ai', reading_notes = $3
       WHERE id = $4`,
      [reading.value, reading.confidence, reading.notes, imageId],
    );
    return Response.json({ success: true, reading });
  }

  // Manual override
  const fields: string[] = [];
  const params: unknown[] = [];
  const setField = (col: string, val: unknown) => {
    params.push(val);
    fields.push(`${col} = $${params.length}`);
  };

  if (body.readingValue !== undefined) {
    const raw = body.readingValue;
    const value = raw === null || raw === "" ? null : Number(raw);
    if (value !== null && !Number.isFinite(value)) {
      return Response.json({ error: "readingValue must be a number or null" }, { status: 400 });
    }
    setField("reading_value", value);
    setField("reading_source", "manual");
    setField("reading_confidence", value === null ? "unreadable" : "high");
  }
  if (body.notes !== undefined) setField("reading_notes", body.notes);

  if (fields.length === 0) return Response.json({ success: true, noop: true });
  params.push(imageId);

  await sql(`UPDATE camera_images SET ${fields.join(", ")} WHERE id = $${params.length}`, params);
  return Response.json({ success: true });
}
