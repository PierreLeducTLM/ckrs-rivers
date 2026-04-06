/**
 * Fetches CEHQ's own flow forecast from their JSON endpoint.
 *
 * URL: https://www.cehq.gouv.qc.ca/depot/suivihydro/bd/JSON/{stationId}.json
 *
 * The `prevision` array contains 3-hourly forecast points with:
 *   - datePrevision: "YYYY-MM-DD HH:MM:SS"
 *   - qMCS: predicted flow (m³/s)
 *   - q25MCS: 25th percentile (lower bound)
 *   - q75MCS: 75th percentile (upper bound)
 */

const CEHQ_JSON_URL =
  "https://www.cehq.gouv.qc.ca/depot/suivihydro/bd/JSON";

export interface CehqForecastPoint {
  timestamp: string; // ISO datetime
  flow: number;      // qMCS (m³/s)
  flowLow: number;   // q25MCS
  flowHigh: number;  // q75MCS
}

export interface CehqForecastResult {
  stationId: string;
  points: CehqForecastPoint[];
}

interface RawPrevision {
  datePrevision: string;
  qMCS: number;
  q25MCS: number;
  q75MCS: number;
}

export async function fetchCehqForecast(
  stationId: string,
): Promise<CehqForecastResult> {
  const url = `${CEHQ_JSON_URL}/${stationId}.json`;
  console.log(`[cehq-forecast] Fetching CEHQ forecast for station ${stationId}...`);
  const t0 = Date.now();

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `CEHQ JSON fetch failed for station ${stationId}: ${response.status}`,
    );
  }

  const data = await response.json() as { prevision?: RawPrevision[] };
  const rawPoints = data.prevision ?? [];

  const points: CehqForecastPoint[] = rawPoints
    .filter((p) => p.qMCS != null && p.q25MCS != null && p.q75MCS != null)
    .map((p) => {
      // "2026-04-02 03:00:00" → "2026-04-02T03:00:00Z"
      const timestamp = p.datePrevision.replace(" ", "T") + "Z";
      return {
        timestamp,
        flow: p.qMCS,
        flowLow: p.q25MCS,
        flowHigh: p.q75MCS,
      };
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  console.log(`[cehq-forecast] Station ${stationId}: ${points.length} forecast points (${Date.now() - t0}ms)`);

  return { stationId, points };
}
