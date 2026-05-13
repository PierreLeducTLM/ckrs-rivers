import { NextRequest } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import type { syncCameraPhotosOne } from "@/src/trigger/sync-camera-photos";
import { sql } from "@/lib/db/client";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const exists = (await sql(`SELECT 1 FROM cameras WHERE id = $1`, [id])) as Array<unknown>;
  if (exists.length === 0) {
    return Response.json({ error: "Camera not found" }, { status: 404 });
  }

  try {
    const handle = await tasks.trigger<typeof syncCameraPhotosOne>(
      "sync-camera-photos-one",
      { cameraId: id },
    );
    return Response.json({ success: true, runId: handle.id });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to trigger sync" },
      { status: 500 },
    );
  }
}
