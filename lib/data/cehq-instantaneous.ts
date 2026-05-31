/**
 * Fetch and parse CEHQ's *instantaneous* (15-minute) historical archive.
 *
 * Unlike the daily `_Q.txt` files handled by `cehq-historical.ts`, this
 * repository holds sub-daily readings, one file per station per year:
 *
 *   https://www.cehq.gouv.qc.ca/depot/historique_donnees_instantanees/{id}_Q_{year}.txt
 *
 * `_Q_` = débit (flow, m³/s), `_N_` = niveau (level, m). The format is the
 * same MELCCFP ASCII layout as the daily files but with a time column:
 *
 *   Station   Date        Heure   [Niveau]  Débit   Remarque
 *   062701    2024/05/01  00:00             123.0
 *
 * Values use either a period or French comma as the decimal separator and
 * may carry a trailing `*`. We reuse the same number parsing as the
 * realtime client and emit the shared `RealtimeReading` shape so callers
 * can pipe straight into `observedToHourly()`.
 */

import type { RealtimeReading } from "@/lib/realtime/cehq-client";

const CEHQ_INSTANTANEOUS_BASE =
  "https://www.cehq.gouv.qc.ca/depot/historique_donnees_instantanees";

/** Parse a French/period-format number: "123,0*" → 123, "12.5" → 12.5 */
function parseNumber(raw: string): number | null {
  if (!raw || raw.trim() === "") return null;
  const cleaned = raw.replace(/\*/g, "").replace(",", ".").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Parse the MELCCFP instantaneous text format into flow readings.
 *
 * Defensive by design: matches a station token, a `YYYY/MM/DD` date and an
 * `HH:MM[:SS]` time, then takes the *last* numeric token on the line as the
 * flow (matching the realtime parser, where level precedes flow when both
 * are present). Header/preamble lines simply don't match and are skipped.
 */
export function parseInstantaneousText(text: string): RealtimeReading[] {
  const lines = text.split("\n");
  const readings: RealtimeReading[] = [];

  for (const line of lines) {
    const match = line.match(
      /^\s*(\S+)\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)\s+(.*)$/,
    );
    if (!match) continue;

    const [, , rawDate, rawTime, rest] = match;
    const numericTokens = rest
      .split(/\s+/)
      .map(parseNumber)
      .filter((n): n is number => n !== null);
    if (numericTokens.length === 0) continue;

    const flow = numericTokens[numericTokens.length - 1];
    if (flow <= 0) continue;

    const date = rawDate.replace(/\//g, "-"); // YYYY-MM-DD
    const time = rawTime.slice(0, 5); // HH:MM
    readings.push({
      date,
      time,
      // CEHQ stamps local time as if UTC; we mirror the realtime client's
      // convention so timestamps line up with the rest of the pipeline.
      timestamp: `${date}T${time}:00Z`,
      waterLevel: numericTokens.length > 1 ? numericTokens[0] : null,
      flow,
    });
  }

  readings.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return readings;
}

/**
 * Fetch one year of instantaneous flow readings for a CEHQ station.
 * Returns `[]` (never throws) when the file is missing or unreadable so
 * callers can degrade gracefully to whatever history they already have.
 */
export async function fetchInstantaneousFlow(
  stationNumber: string,
  year: number,
): Promise<RealtimeReading[]> {
  const url = `${CEHQ_INSTANTANEOUS_BASE}/${stationNumber}_Q_${year}.txt`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "FlowCast-App/1.0" },
    });
    if (!res.ok) {
      console.warn(`[cehq-instantaneous] ${stationNumber} ${year}: HTTP ${res.status}`);
      return [];
    }
    const text = await res.text();
    if (!text.includes(stationNumber)) {
      console.warn(`[cehq-instantaneous] ${stationNumber} ${year}: file missing station id`);
      return [];
    }
    const readings = parseInstantaneousText(text);
    console.log(
      `[cehq-instantaneous] ${stationNumber} ${year}: ${readings.length} readings` +
        (readings.length > 0 ? ` (${readings[0].timestamp} → ${readings[readings.length - 1].timestamp})` : ""),
    );
    return readings;
  } catch (err) {
    console.warn(
      `[cehq-instantaneous] ${stationNumber} ${year}: fetch failed — ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}
