/**
 * Fetches real-time flow data from the CEHQ (Centre d'expertise hydrique du Québec)
 * monitoring network.
 *
 * URL: https://www.cehq.gouv.qc.ca/suivihydro/fichier_donnees.asp?NoStation=XXXXXX
 *
 * Returns ~7 days of 15-minute interval readings.
 * Data is tab-separated, French decimal format (comma), and may have trailing asterisks.
 */

const CEHQ_BASE_URL =
  "https://www.cehq.gouv.qc.ca/suivihydro/fichier_donnees.asp";

export interface RealtimeReading {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  timestamp: string; // ISO datetime
  waterLevel: number | null; // meters
  flow: number | null; // m³/s
}

export interface RealtimeResult {
  stationId: string;
  readings: RealtimeReading[];
  latestFlow: number | null;
  latestDate: string | null;
  dailyAverages: Map<string, number>;
}

/**
 * Parse a French-format number: "2,920*" → 2.92
 */
function parseFrenchNumber(raw: string): number | null {
  if (!raw || raw.trim() === "") return null;
  const cleaned = raw.replace(/\*/g, "").replace(",", ".").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Fetch real-time data for a CEHQ station.
 */
export async function fetchRealtimeData(
  stationId: string,
): Promise<RealtimeResult> {
  const url = `${CEHQ_BASE_URL}?NoStation=${stationId}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `CEHQ fetch failed for station ${stationId}: ${response.status}`,
    );
  }

  const text = await response.text();
  const lines = text.split("\n");

  const readings: RealtimeReading[] = [];

  for (const line of lines) {
    // Match data lines: YYYY-MM-DD\tHH:MM\t...
    // Format A (4 cols): Date\tHeure\tNiveau\t\tDébit  (level + flow)
    // Format B (3 cols): Date\tHeure\tDébit             (flow only)
    const match = line.match(/^(\d{4}-\d{2}-\d{2})\t(\d{2}:\d{2})\t(.+)$/);
    if (!match) continue;

    const [, date, time, rest] = match;
    const parts = rest.split("\t").map((s) => s.trim());

    let waterLevel: number | null = null;
    let flow: number | null = null;

    if (parts.length >= 2) {
      // Format A: level \t\t flow (may have empty tab between)
      waterLevel = parseFrenchNumber(parts[0]);
      flow = parseFrenchNumber(parts[parts.length - 1]);
    } else {
      // Format B: just flow
      flow = parseFrenchNumber(parts[0]);
    }

    if (flow === null) continue;

    readings.push({
      date,
      time,
      timestamp: `${date}T${time}:00Z`,
      waterLevel,
      flow,
    });
  }

  // Sort chronologically (data comes in reverse order)
  readings.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Compute daily averages
  const dailyAverages = new Map<string, number>();
  const dailySums = new Map<string, { sum: number; count: number }>();

  for (const r of readings) {
    if (r.flow === null) continue;
    const entry = dailySums.get(r.date) ?? { sum: 0, count: 0 };
    entry.sum += r.flow;
    entry.count += 1;
    dailySums.set(r.date, entry);
  }

  for (const [date, { sum, count }] of dailySums) {
    dailyAverages.set(date, sum / count);
  }

  // Latest reading
  const latest = readings.length > 0 ? readings[readings.length - 1] : null;

  return {
    stationId,
    readings,
    latestFlow: latest?.flow ?? null,
    latestDate: latest?.date ?? null,
    dailyAverages,
  };
}
