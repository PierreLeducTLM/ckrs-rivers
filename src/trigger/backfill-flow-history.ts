import { logger, schedules } from "@trigger.dev/sdk/v3";
import { neon } from "@neondatabase/serverless";

/**
 * Daily top-up of `flow_readings_hourly` from CEHQ's realtime feed.
 *
 * The realtime endpoint returns the last ~7 days of 15-minute readings,
 * which we aggregate to hourly and upsert. Running this daily continuously
 * grows the persistent hourly history from the live feed and keeps the
 * current period fresh. The deep past (up to ~1 year) is backfilled lazily
 * on demand from CEHQ's per-year instantaneous archive when a user first
 * scrolls into it (see lib/data/flow-history.ts).
 *
 * Imports are inlined (no @/ alias) so the task bundles cleanly for
 * Trigger.dev, matching refresh-all-stations.ts.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlFn = (query: string, params?: any[]) => Promise<any[]>;

function createSql(): SqlFn {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  const neonSql = neon(process.env.DATABASE_URL);
  return (query, params) => neonSql.query(query, params ?? []);
}

function parseFrenchNumber(raw: string): number | null {
  if (!raw || raw.trim() === "") return null;
  const cleaned = raw.replace(/\*/g, "").replace(",", ".").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

interface RealtimeReading {
  date: string;
  time: string;
  flow: number | null;
}

async function fetchRealtimeReadings(stationNumber: string): Promise<RealtimeReading[]> {
  const url = `https://www.cehq.gouv.qc.ca/suivihydro/fichier_donnees.asp?NoStation=${stationNumber}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`CEHQ fetch failed: ${response.status}`);

  const text = await response.text();
  const readings: RealtimeReading[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^(\d{4}-\d{2}-\d{2})\t(\d{2}:\d{2})\t(.+)$/);
    if (!match) continue;
    const [, date, time, rest] = match;
    const parts = rest.split("\t").map((s) => s.trim());
    const flow = parts.length >= 2 ? parseFrenchNumber(parts[parts.length - 1]) : parseFrenchNumber(parts[0]);
    if (flow === null) continue;
    readings.push({ date, time, flow });
  }
  return readings;
}

/** Aggregate 15-min readings to hourly averages with ISO timestamps. */
function observedToHourly(readings: RealtimeReading[]): Array<{ timestamp: string; flow: number }> {
  const byHour = new Map<string, { sum: number; count: number }>();
  for (const r of readings) {
    if (r.flow === null) continue;
    const hour = r.time.slice(0, 2);
    const key = `${r.date}T${hour}`;
    const entry = byHour.get(key) ?? { sum: 0, count: 0 };
    entry.sum += r.flow;
    entry.count += 1;
    byHour.set(key, entry);
  }
  return [...byHour.entries()]
    .map(([key, { sum, count }]) => ({ timestamp: `${key}:00:00Z`, flow: sum / count }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function upsertHourly(
  dbSql: SqlFn,
  stationId: string,
  points: Array<{ timestamp: string; flow: number }>,
): Promise<void> {
  const CHUNK = 1000;
  for (let i = 0; i < points.length; i += CHUNK) {
    const chunk = points.slice(i, i + CHUNK);
    const values: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any[] = [];
    chunk.forEach((p, k) => {
      const b = k * 3;
      values.push(`($${b + 1}, $${b + 2}, $${b + 3})`);
      params.push(stationId, p.timestamp, p.flow);
    });
    await dbSql(
      `INSERT INTO flow_readings_hourly (station_id, ts, flow_m3s)
       VALUES ${values.join(", ")}
       ON CONFLICT (station_id, ts) DO UPDATE SET
         flow_m3s = EXCLUDED.flow_m3s,
         source = 'cehq-realtime'`,
      params,
    );
  }
}

export const backfillFlowHistory = schedules.task({
  id: "backfill-flow-history",
  // Once a day, early morning Montreal time.
  cron: { pattern: "30 5 * * *", timezone: "America/Toronto" },
  maxDuration: 600,
  run: async () => {
    const dbSql = createSql();

    const stations = (await dbSql(
      `SELECT id, COALESCE(station_number, id) AS station_number
         FROM stations
        WHERE status NOT IN ('error', 'test', 'info')
        ORDER BY id`,
    )) as Array<{ id: string; station_number: string }>;

    logger.info(`Topping up hourly history for ${stations.length} stations`);

    let succeeded = 0;
    let failed = 0;
    let totalPoints = 0;

    for (const station of stations) {
      try {
        const readings = await fetchRealtimeReadings(station.station_number);
        const hourly = observedToHourly(readings);
        if (hourly.length > 0) {
          await upsertHourly(dbSql, station.id, hourly);
          totalPoints += hourly.length;
        }
        succeeded++;
      } catch (err) {
        failed++;
        logger.warn(`Station ${station.id} history top-up failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    logger.info(`History top-up complete: ${succeeded} ok, ${failed} failed, ${totalPoints} hourly points upserted`);
    return { total: stations.length, succeeded, failed, totalPoints };
  },
});
