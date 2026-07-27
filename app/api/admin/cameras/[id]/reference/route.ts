import { NextRequest } from "next/server";
import { del } from "@vercel/blob";
import { sql } from "@/lib/db/client";
import { uploadCameraReference } from "@/lib/storage/blob";

// PUT: save the client-composited annotated reference image (multipart form:
// `image` file + `annotations` JSON string) for a camera.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const cameras = (await sql(`SELECT id FROM cameras WHERE id = $1`, [id])) as Array<{ id: string }>;
  if (cameras.length === 0) return Response.json({ error: "Camera not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const image = form.get("image");
  if (!(image instanceof File)) {
    return Response.json({ error: "Missing image file" }, { status: 400 });
  }

  const annotationsRaw = form.get("annotations");
  let annotations: unknown = null;
  if (typeof annotationsRaw === "string" && annotationsRaw.trim() !== "") {
    try {
      annotations = JSON.parse(annotationsRaw);
    } catch {
      return Response.json({ error: "annotations must be valid JSON" }, { status: 400 });
    }
  }

  const bytes = new Uint8Array(await image.arrayBuffer());

  try {
    const { url, pathname } = await uploadCameraReference(id, bytes, image.type || "image/png");
    await sql(
      `UPDATE cameras
       SET reference_blob_url = $1,
           reference_blob_pathname = $2,
           reference_annotations_json = $3,
           updated_at = now()
       WHERE id = $4`,
      [url, pathname, annotations === null ? null : JSON.stringify(annotations), id],
    );
    return Response.json({ success: true, referenceUrl: url, annotations });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Reference upload failed" },
      { status: 500 },
    );
  }
}

// DELETE: remove the reference image + annotations for a camera.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const rows = (await sql(
    `SELECT reference_blob_pathname FROM cameras WHERE id = $1`,
    [id],
  )) as Array<{ reference_blob_pathname: string | null }>;
  if (rows.length === 0) return Response.json({ error: "Camera not found" }, { status: 404 });

  await sql(
    `UPDATE cameras
     SET reference_blob_url = NULL,
         reference_blob_pathname = NULL,
         reference_annotations_json = NULL,
         updated_at = now()
     WHERE id = $1`,
    [id],
  );

  const pathname = rows[0].reference_blob_pathname;
  if (pathname) {
    try {
      await del(pathname);
    } catch {
      // Storage cleanup is non-fatal; the DB row is already cleared.
    }
  }

  return Response.json({ success: true });
}
