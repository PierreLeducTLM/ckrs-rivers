/**
 * Persistent hourly flow history for the river detail chart.
 *
 * Reads from `flow_readings_hourly`, lazily backfilling from CEHQ's
 * instantaneous (15-min) archive — aggregated to hourly — the first time a
 * given year is requested. Backfill failures degrade gracefully: callers
 * still get whatever history is already stored.
 */

import { sql } from "@/lib/db/client";
import { fetchInstantaneousFlow } from "@/lib/data/cehq-instantaneous";
import { fetchHistoricalFlowData } from "@/lib/data/cehq-historical";
import { observedToHourly } from "@/lib/realtime/diurnal-profile";

export interface HourlyHistoryPoint {
  timestamp: string; // ISO "...Z"
  flow: number; // m³/s
}

interface ResolvedStation {
  id: string;
  stationNumber: string | null;
}

const UPSERT_CHUNK = 1000;

/**
 * Resolve a station key (internal id *or* CEHQ station number) to the
 * stored station row. Prefers an exact id match. Returns null if unknown.
 */
async function resolveStation(key: string): Promise<ResolvedStation | null> {
  const rows = (await sql(
    `SELECT id, station_number
       FROM stations
      WHERE id = $1 OR station_number = $1
      ORDER BY (id = $1) DESC
      LIMIT 1`,
    [key],
  )) as Array<{ id: string; station_number: string | null }>;
  const row = rows[0];
  return row ? { id: row.id, stationNumber: row.station_number } : null;
}

function isoUTC(ms: number): string {
  return new Date(ms).toISOString();
}

/** Distinct UTC calendar years spanned by [startMs, endMs]. */
function yearsInRange(startMs: number, endMs: number): number[] {
  const startYear = new Date(startMs).getUTCFullYear();
  const endYear = new Date(endMs).getUTCFullYear();
  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);
  return years;
}

async function upsertHourly(
  stationId: string,
  points: Array<{ timestamp: string; flow: number }>,
  source: string,
): Promise<void> {
  for (let i = 0; i < points.length; i += UPSERT_CHUNK) {
    const chunk = points.slice(i, i + UPSERT_CHUNK);
    const values: string[] = [];
    const params: unknown[] = [];
    chunk.forEach((p, k) => {
      const b = k * 4;
      values.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`);
      params.push(stationId, p.timestamp, p.flow, source);
    });
    await sql(
      `INSERT INTO flow_readings_hourly (station_id, ts, flow_m3s, source)
       VALUES ${values.join(", ")}
       ON CONFLICT (station_id, ts) DO UPDATE SET
         flow_m3s = EXCLUDED.flow_m3s,
         source = EXCLUDED.source`,
      params,
    );
  }
}

/**
 * Ensure the `[startMs, endMs]` window is backfilled for a station.
 *
 * For each calendar year the window touches, fetches that year's
 * instantaneous file and upserts hourly aggregates when the year has no
 * stored rows yet (or, for the current year, when the request reaches past
 * what we already have). Safe to call on every request — it no-ops once the
 * relevant years are present and fresh.
 */
export async function ensureHourlyHistory(
  stationKey: string,
  startMs: number,
  endMs: number,
): Promise<void> {
  const station = await resolveStation(stationKey);
  if (!station || !station.stationNumber) return; // unknown / custom river — nothing to fetch
  const stationNumber = station.stationNumber;

  const currentYear = new Date().getUTCFullYear();

  // The full daily record is fetched at most once per call and covers every
  // year, so we guard it to avoid re-downloading the (large) historical file.
  let dailyDone = false;
  const backfillDaily = async (): Promise<boolean> => {
    if (dailyDone) return false;
    dailyDone = true;
    const records = await fetchHistoricalFlowData(stationNumber);
    const points = records
      .map((r) => ({ timestamp: `${r.date}T00:00:00Z`, flow: r.flow }))
      .filter((p) => Number.isFinite(Date.parse(p.timestamp)) && p.flow > 0);
    if (points.length === 0) return false;
    await upsertHourly(station.id, points, "cehq-daily");
    return true;
  };

  for (const year of yearsInRange(startMs, endMs)) {
    if (year > currentYear) continue;
    const yearStart = `${year}-01-01T00:00:00Z`;
    const yearEnd = `${year + 1}-01-01T00:00:00Z`;

    const cov = (await sql(
      `SELECT count(*)::int AS n
         FROM flow_readings_hourly
        WHERE station_id = $1 AND ts >= $2 AND ts < $3`,
      [station.id, yearStart, yearEnd],
    )) as Array<{ n: number }>;
    if ((cov[0]?.n ?? 0) > 0) continue; // already have data for this year

    // Prefer true sub-daily resolution when CEHQ publishes it…
    const readings = await fetchInstantaneousFlow(stationNumber, year);
    const hourly = observedToHourly(readings).map((p) => ({
      timestamp: p.timestamp,
      flow: p.flow,
    }));
    if (hourly.length > 0) {
      await upsertHourly(station.id, hourly, "cehq-instantaneous");
      continue;
    }

    // …otherwise fall back to the reliable daily record (covers all years).
    await backfillDaily();
  }
}

/** Read stored hourly history for a window. Does not fetch. */
export async function getHourlyHistory(
  stationKey: string,
  startMs: number,
  endMs: number,
): Promise<HourlyHistoryPoint[]> {
  const station = await resolveStation(stationKey);
  if (!station) return [];

  const rows = (await sql(
    `SELECT to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS timestamp,
            flow_m3s
       FROM flow_readings_hourly
      WHERE station_id = $1 AND ts >= $2 AND ts <= $3
      ORDER BY ts ASC`,
    [station.id, isoUTC(startMs), isoUTC(endMs)],
  )) as Array<{ timestamp: string; flow_m3s: number }>;

  return rows.map((r) => ({ timestamp: r.timestamp, flow: r.flow_m3s }));
}
