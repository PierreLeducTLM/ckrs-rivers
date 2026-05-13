import { logger, schedules } from "@trigger.dev/sdk/v3";
import { neon } from "@neondatabase/serverless";
import { deleteCameraImages } from "@/lib/storage/blob";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlFn = (query: string, params?: any[]) => Promise<any[]>;

function createSql(): SqlFn {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const neonSql = neon(process.env.DATABASE_URL);
  return (query, params) => neonSql.query(query, params ?? []);
}

const RETENTION_DAYS = 3;
const BLOB_DELETE_CHUNK = 100;
const SCHEDULE_TIMEZONE = "America/Toronto";

export const cleanupCameraPhotos = schedules.task({
  id: "cleanup-camera-photos",
  cron: { pattern: "30 3 * * *", timezone: SCHEDULE_TIMEZONE },
  maxDuration: 300,
  run: async () => {
    const sql = createSql();

    const expired = (await sql(
      `SELECT id, blob_url
         FROM camera_images
        WHERE captured_at < now() - ($1 || ' days')::interval`,
      [String(RETENTION_DAYS)],
    )) as Array<{ id: string; blob_url: string | null }>;

    if (expired.length === 0) {
      logger.info(`No camera_images older than ${RETENTION_DAYS} days`);
      return { deleted: 0, blobErrors: 0 };
    }

    logger.info(
      `Cleaning up ${expired.length} camera_images older than ${RETENTION_DAYS} days`,
    );

    // Best-effort blob deletion FIRST: if it fails, the DB rows remain so the
    // task retries them tomorrow. Doing it the other way around would orphan
    // blobs with no DB pointer to find them.
    const urls = expired
      .map((r) => r.blob_url)
      .filter((u): u is string => typeof u === "string" && u.length > 0);
    let blobErrors = 0;
    for (let i = 0; i < urls.length; i += BLOB_DELETE_CHUNK) {
      const chunk = urls.slice(i, i + BLOB_DELETE_CHUNK);
      try {
        await deleteCameraImages(chunk);
      } catch (err) {
        blobErrors += 1;
        logger.warn(
          `Blob cleanup chunk failed (${chunk.length} files): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const ids = expired.map((r) => r.id);
    await sql(`DELETE FROM camera_images WHERE id = ANY($1::text[])`, [ids]);

    logger.info(
      `Cleanup complete: deleted ${ids.length} rows, ${blobErrors} blob chunk error(s)`,
    );
    return { deleted: ids.length, blobErrors };
  },
});
