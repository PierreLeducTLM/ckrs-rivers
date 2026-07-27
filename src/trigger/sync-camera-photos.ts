import { logger, schedules, task } from "@trigger.dev/sdk/v3";
import { neon } from "@neondatabase/serverless";
import { createSpypointClient } from "@/lib/skypoint/client";
import type { SpypointApi, SpypointPhoto } from "@/lib/skypoint/types";
import { uploadCameraImage } from "@/lib/storage/blob";
import { readLevel } from "@/lib/skypoint/read-level";
import { BlinkMockClient } from "@/lib/blink/mock-client";
import { clientForAccount, getBlinkAccount, markBlinkAccountError, type SqlFn as BlinkSqlFn } from "@/lib/blink/account-store";
import type { BlinkCamera } from "@/lib/blink/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlFn = (query: string, params?: any[]) => Promise<any[]>;

function createSql(): SqlFn {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const neonSql = neon(process.env.DATABASE_URL);
  return (query, params) => neonSql.query(query, params ?? []);
}

interface CameraRow {
  id: string;
  provider: string; // 'spypoint' | 'blink'
  provider_camera_id: string | null;
  provider_account_id: string | null;
  scale_description: string | null;
  scale_min: number | null;
  scale_max: number | null;
  scale_unit: string | null;
  reference_blob_url: string | null;
  last_synced_photo_date: string | null;
}

interface SyncResult {
  inserted: number;
  skipped: number;
  readingErrors: number;
  error?: string;
}

const CAMERA_SELECT = `
  SELECT id, provider, provider_camera_id, provider_account_id,
         scale_description, scale_min, scale_max, scale_unit,
         reference_blob_url,
         last_synced_photo_date::text AS last_synced_photo_date
`;

// ---------------------------------------------------------------------------
// Shared pipeline: bytes → blob → vision → camera_images row → watermark
// ---------------------------------------------------------------------------

interface IncomingPhoto {
  photoId: string; // dedupe key, scoped per provider via the unique index
  capturedAt: Date;
  bytes: Uint8Array;
}

async function storePhoto(
  sql: SqlFn,
  camera: CameraRow,
  photo: IncomingPhoto,
): Promise<{ inserted: boolean; readingError: boolean }> {
  // Dedupe — the partial unique index on provider_photo_id is best-effort
  // but checking first lets us silently skip without surfacing an error
  // from the cron run.
  const existing = await sql(
    `SELECT 1 FROM camera_images WHERE provider_photo_id = $1 LIMIT 1`,
    [photo.photoId],
  );
  if (existing.length > 0) return { inserted: false, readingError: false };

  const { url, pathname } = await uploadCameraImage(camera.id, photo.photoId, photo.bytes);

  const reading = await readLevel({
    imageUrl: url,
    scaleDescription: camera.scale_description,
    scaleMin: camera.scale_min,
    scaleMax: camera.scale_max,
    scaleUnit: camera.scale_unit,
    referenceImageUrl: camera.reference_blob_url,
  });

  const readingError =
    reading.confidence === "unreadable" && reading.notes.startsWith("Vision call failed");

  // For backward-compat on the legacy spypoint-specific column, write it
  // for Spypoint photos so any unmigrated reader keeps working. Blink
  // photos leave that column NULL.
  const legacySpypointId = camera.provider === "spypoint" ? photo.photoId : null;

  await sql(
    `INSERT INTO camera_images (
       camera_id, provider_photo_id, spypoint_photo_id, captured_at,
       blob_url, blob_pathname,
       reading_value, reading_confidence, reading_source, reading_notes,
       reading_waterline_json
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ai', $9, $10)`,
    [
      camera.id,
      photo.photoId,
      legacySpypointId,
      photo.capturedAt.toISOString(),
      url,
      pathname,
      reading.value,
      reading.confidence,
      reading.notes,
      reading.waterline ? JSON.stringify(reading.waterline) : null,
    ],
  );

  return { inserted: true, readingError };
}

async function advanceWatermark(sql: SqlFn, cameraId: string, newest: Date): Promise<void> {
  await sql(
    `UPDATE cameras SET last_synced_photo_date = $1, updated_at = now() WHERE id = $2`,
    [newest.toISOString(), cameraId],
  );
}

// ---------------------------------------------------------------------------
// Spypoint sync: list newer photos, download each, run pipeline
// ---------------------------------------------------------------------------

async function syncSpypointCamera(
  sql: SqlFn,
  client: SpypointApi,
  camera: CameraRow,
): Promise<SyncResult> {
  if (!camera.provider_camera_id) {
    return { inserted: 0, skipped: 0, readingErrors: 0, error: "Spypoint camera missing provider_camera_id" };
  }
  const watermark = camera.last_synced_photo_date ? new Date(camera.last_synced_photo_date) : null;

  const photos = await client.getPhotos({
    cameras: [camera.provider_camera_id],
    limit: 25,
  });

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
      const bytes = await client.downloadPhoto(photo, { size: "large" });
      const result = await storePhoto(sql, camera, {
        photoId: photo.id,
        capturedAt: photo.date,
        bytes,
      });
      if (result.inserted) inserted += 1;
      else skipped += 1;
      if (result.readingError) readingErrors += 1;
      if (!newestDate || photo.date > newestDate) newestDate = photo.date;
    } catch (err) {
      logger.warn(`Camera ${camera.id} photo ${photo.id} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (newestDate && (!watermark || newestDate > watermark)) {
    await advanceWatermark(sql, camera.id, newestDate);
  }

  return { inserted, skipped, readingErrors };
}

// ---------------------------------------------------------------------------
// Blink sync: snap → wait → re-list → download fresh thumbnail → run pipeline
// ---------------------------------------------------------------------------

interface BlinkClientLike {
  listCameras(): Promise<BlinkCamera[]>;
  snapPicture(camera: Pick<BlinkCamera, "id" | "networkId" | "type">): Promise<{ networkId: number | string; commandId: number | string }>;
  waitForCommand(networkId: number | string, commandId: number | string): Promise<boolean>;
  fetchThumbnail(camera: BlinkCamera): Promise<Uint8Array>;
}

async function resolveBlinkClient(sql: SqlFn, camera: CameraRow): Promise<BlinkClientLike> {
  if (process.env.BLINK_MOCK === "1") return new BlinkMockClient();
  if (!camera.provider_account_id) {
    throw new Error("Blink camera has no provider_account_id; assign an account first");
  }
  const account = await getBlinkAccount(sql as BlinkSqlFn, camera.provider_account_id);
  if (!account) throw new Error(`Blink account ${camera.provider_account_id} not found`);
  if (!account.tokens_json) throw new Error(`Blink account ${account.label} has not completed 2FA`);
  return clientForAccount(sql as BlinkSqlFn, account);
}

async function syncBlinkCamera(sql: SqlFn, camera: CameraRow): Promise<SyncResult> {
  if (!camera.provider_camera_id) {
    return { inserted: 0, skipped: 0, readingErrors: 0, error: "Blink camera missing provider_camera_id" };
  }

  let client: BlinkClientLike;
  try {
    client = await resolveBlinkClient(sql, camera);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (camera.provider_account_id) {
      await markBlinkAccountError(sql as BlinkSqlFn, camera.provider_account_id, msg).catch(() => {});
    }
    return { inserted: 0, skipped: 0, readingErrors: 0, error: msg };
  }

  // Find the Blink camera in the homescreen so we know its network + type.
  const cameras = await client.listCameras();
  const target = cameras.find((c) => String(c.id) === camera.provider_camera_id);
  if (!target) {
    return { inserted: 0, skipped: 0, readingErrors: 0, error: `Blink camera ${camera.provider_camera_id} not found in account` };
  }

  // Best-effort snap: trigger a fresh photo but don't fail the run if the
  // command times out — we'll just fall back to whatever thumbnail Blink
  // already has cached.
  try {
    const { networkId, commandId } = await client.snapPicture({ id: target.id, networkId: target.networkId, type: target.type });
    const done = await client.waitForCommand(networkId, commandId);
    if (!done) logger.info(`Blink snap timed out for camera ${camera.id}; using previous thumbnail`);
  } catch (err) {
    logger.warn(`Blink snap failed for camera ${camera.id}: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Re-fetch the homescreen to pick up the new thumbnail timestamp.
  const refreshed = await client.listCameras();
  const fresh = refreshed.find((c) => String(c.id) === camera.provider_camera_id) ?? target;

  const capturedAt = fresh.thumbnailUpdatedAt ?? new Date();
  const watermark = camera.last_synced_photo_date ? new Date(camera.last_synced_photo_date) : null;
  if (watermark && capturedAt <= watermark) {
    return { inserted: 0, skipped: 1, readingErrors: 0 };
  }

  // Synthetic dedupe key — Blink doesn't expose stable per-frame ids.
  const photoId = `blink-${fresh.id}-${capturedAt.getTime()}`;

  const bytes = await client.fetchThumbnail(fresh);
  const result = await storePhoto(sql, camera, { photoId, capturedAt, bytes });

  if (result.inserted) {
    await advanceWatermark(sql, camera.id, capturedAt);
  }

  return {
    inserted: result.inserted ? 1 : 0,
    skipped: result.inserted ? 0 : 1,
    readingErrors: result.readingError ? 1 : 0,
  };
}

// ---------------------------------------------------------------------------
// Provider dispatch
// ---------------------------------------------------------------------------

async function syncCamera(sql: SqlFn, spypointClient: SpypointApi, camera: CameraRow): Promise<SyncResult> {
  if (camera.provider === "spypoint") return syncSpypointCamera(sql, spypointClient, camera);
  if (camera.provider === "blink") return syncBlinkCamera(sql, camera);
  return { inserted: 0, skipped: 0, readingErrors: 0, error: `Unknown provider: ${camera.provider}` };
}

// ---------------------------------------------------------------------------
// Scheduled sync — every hour during the day, Montreal time
// ---------------------------------------------------------------------------

const SCHEDULE_TIMEZONE = "America/Toronto";

export const syncCameraPhotos = schedules.task({
  id: "sync-camera-photos",
  cron: { pattern: "0 * * * *", timezone: SCHEDULE_TIMEZONE },
  maxDuration: 600,
  run: async (payload, { ctx }) => {
    const localHour = parseInt(
      payload.timestamp.toLocaleString("en-US", {
        timeZone: SCHEDULE_TIMEZONE,
        hour: "2-digit",
        hour12: false,
      }),
      10,
    );
    const isManualRun = ctx.run.isTest;
    if (!isManualRun && (localHour < 5 || localHour >= 22)) {
      logger.info(`Skipping sync outside daytime (local hour ${localHour})`);
      return { skipped: true, localHour };
    }

    const sql = createSql();
    const cameras = (await sql(
      `${CAMERA_SELECT}
       FROM cameras
       WHERE active = true
       ORDER BY id`,
    )) as CameraRow[];

    if (cameras.length === 0) {
      logger.info("No active cameras to sync");
      return { total: 0 };
    }

    // Lazily build the Spypoint client only if we actually need it — Blink
    // cameras don't require Spypoint env vars.
    let spypointClient: SpypointApi | null = null;
    const ensureSpypoint = (): SpypointApi => {
      if (!spypointClient) spypointClient = createSpypointClient();
      return spypointClient;
    };

    const results: Array<{ cameraId: string; provider: string; inserted: number; skipped: number; readingErrors: number; error?: string }> = [];

    for (const camera of cameras) {
      try {
        const client = camera.provider === "spypoint" ? ensureSpypoint() : (null as unknown as SpypointApi);
        const r = await syncCamera(sql, client, camera);
        logger.info(`Camera ${camera.id} [${camera.provider}]: +${r.inserted} new, ${r.skipped} skipped, ${r.readingErrors} reader errors${r.error ? ` (error: ${r.error})` : ""}`);
        results.push({ cameraId: camera.id, provider: camera.provider, ...r });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`Camera ${camera.id} [${camera.provider}] sync failed: ${msg}`);
        results.push({ cameraId: camera.id, provider: camera.provider, inserted: 0, skipped: 0, readingErrors: 0, error: msg });
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
      `${CAMERA_SELECT}
       FROM cameras
       WHERE id = $1`,
      [payload.cameraId],
    )) as CameraRow[];

    if (rows.length === 0) throw new Error(`Camera ${payload.cameraId} not found`);

    const camera = rows[0];
    const spypointClient = camera.provider === "spypoint" ? createSpypointClient() : (null as unknown as SpypointApi);
    const result = await syncCamera(sql, spypointClient, camera);
    logger.info(`Camera ${payload.cameraId} [${camera.provider}]: +${result.inserted} new, ${result.skipped} skipped, ${result.readingErrors} reader errors${result.error ? ` (error: ${result.error})` : ""}`);
    return result;
  },
});
