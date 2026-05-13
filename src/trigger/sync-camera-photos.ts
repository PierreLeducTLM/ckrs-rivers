import { logger, schedules, task } from "@trigger.dev/sdk/v3";
import { neon } from "@neondatabase/serverless";
import { createSpypointClient } from "@/lib/skypoint/client";
import type { SpypointApi, SpypointPhoto } from "@/lib/skypoint/types";
import { uploadCameraImage } from "@/lib/storage/blob";
import { readLevel } from "@/lib/skypoint/read-level";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlFn = (query: string, params?: any[]) => Promise<any[]>;

function createSql(): SqlFn {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const neonSql = neon(process.env.DATABASE_URL);
  return (query, params) => neonSql.query(query, params ?? []);
}

interface CameraRow {
  id: string;
  spypoint_camera_id: string;
  scale_description: string | null;
  scale_min: number | null;
  scale_max: number | null;
  scale_unit: string | null;
  last_synced_photo_date: string | null;
}

async function syncCamera(
  sql: SqlFn,
  client: SpypointApi,
  camera: CameraRow,
): Promise<{ inserted: number; skipped: number; readingErrors: number }> {
  const watermark = camera.last_synced_photo_date ? new Date(camera.last_synced_photo_date) : null;

  const photos = await client.getPhotos({
    cameras: [camera.spypoint_camera_id],
    limit: 25,
  });

  // Newest first → oldest first so we update the watermark monotonically
  const sorted = photos
    .filter((p): p is SpypointPhoto & { date: Date } => p.date != null)
    .filter((p) => !watermark || p.date > watermark)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  let inserted = 0;
  let skipped = 0;
  let readingErrors = 0;
  let newestDate = watermark;

  for (const photo of sorted) {
    try {
      // Dedupe in case the watermark missed something (e.g. backfill)
      const existing = await sql(
        `SELECT 1 FROM camera_images WHERE spypoint_photo_id = $1 LIMIT 1`,
        [photo.id],
      );
      if (existing.length > 0) {
        skipped += 1;
        if (!newestDate || photo.date > newestDate) newestDate = photo.date;
        continue;
      }

      const bytes = await client.downloadPhoto(photo, { size: "medium" });
      const { url, pathname } = await uploadCameraImage(camera.id, photo.id, bytes);

      const reading = await readLevel({
        imageUrl: url,
        scaleDescription: camera.scale_description,
        scaleMin: camera.scale_min,
        scaleMax: camera.scale_max,
        scaleUnit: camera.scale_unit,
      });

      if (reading.confidence === "unreadable" && reading.notes.startsWith("Vision call failed")) {
        readingErrors += 1;
      }

      await sql(
        `INSERT INTO camera_images (
           camera_id, spypoint_photo_id, captured_at,
           blob_url, blob_pathname,
           reading_value, reading_confidence, reading_source, reading_notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ai', $8)`,
        [
          camera.id,
          photo.id,
          photo.date.toISOString(),
          url,
          pathname,
          reading.value,
          reading.confidence,
          reading.notes,
        ],
      );

      inserted += 1;
      if (!newestDate || photo.date > newestDate) newestDate = photo.date;
    } catch (err) {
      logger.warn(`Camera ${camera.id} photo ${photo.id} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (newestDate && (!watermark || newestDate > watermark)) {
    await sql(
      `UPDATE cameras SET last_synced_photo_date = $1, updated_at = now() WHERE id = $2`,
      [newestDate.toISOString(), camera.id],
    );
  }

  return { inserted, skipped, readingErrors };
}

// ---------------------------------------------------------------------------
// Scheduled sync — every hour during the day, Montreal time
// ---------------------------------------------------------------------------

const SCHEDULE_TIMEZONE = "America/Toronto";

export const syncCameraPhotos = schedules.task({
  id: "sync-camera-photos",
  cron: { pattern: "0 * * * *", timezone: SCHEDULE_TIMEZONE },
  maxDuration: 600,
  run: async (payload) => {
    const localHour = parseInt(
      payload.timestamp.toLocaleString("en-US", {
        timeZone: SCHEDULE_TIMEZONE,
        hour: "2-digit",
        hour12: false,
      }),
      10,
    );
    if (localHour < 5 || localHour >= 22) {
      logger.info(`Skipping sync outside daytime (local hour ${localHour})`);
      return { skipped: true, localHour };
    }

    const sql = createSql();
    const cameras = (await sql(
      `SELECT id, spypoint_camera_id, scale_description, scale_min, scale_max, scale_unit,
              last_synced_photo_date::text
       FROM cameras
       WHERE active = true
       ORDER BY id`,
    )) as CameraRow[];

    if (cameras.length === 0) {
      logger.info("No active cameras to sync");
      return { total: 0 };
    }

    const client = createSpypointClient();
    const results: Array<{ cameraId: string; inserted: number; skipped: number; readingErrors: number; error?: string }> = [];

    for (const camera of cameras) {
      try {
        const r = await syncCamera(sql, client, camera);
        logger.info(`Camera ${camera.id}: +${r.inserted} new, ${r.skipped} skipped, ${r.readingErrors} reader errors`);
        results.push({ cameraId: camera.id, ...r });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`Camera ${camera.id} sync failed: ${msg}`);
        results.push({ cameraId: camera.id, inserted: 0, skipped: 0, readingErrors: 0, error: msg });
      }
    }

    return { total: cameras.length, results };
  },
});

// ---------------------------------------------------------------------------
// On-demand sync for a single camera (admin "Sync now" button)
// ---------------------------------------------------------------------------

export const syncCameraPhotosOne = task({
  id: "sync-camera-photos-one",
  maxDuration: 300,
  run: async (payload: { cameraId: string }) => {
    const sql = createSql();
    const rows = (await sql(
      `SELECT id, spypoint_camera_id, scale_description, scale_min, scale_max, scale_unit,
              last_synced_photo_date::text
       FROM cameras
       WHERE id = $1`,
      [payload.cameraId],
    )) as CameraRow[];

    if (rows.length === 0) throw new Error(`Camera ${payload.cameraId} not found`);

    const client = createSpypointClient();
    const result = await syncCamera(sql, client, rows[0]);
    logger.info(`Camera ${payload.cameraId}: +${result.inserted} new, ${result.skipped} skipped, ${result.readingErrors} reader errors`);
    return result;
  },
});
