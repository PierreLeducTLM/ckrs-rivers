/**
 * Fetch and parse full historical flow data from CEHQ/MELCCFP.
 *
 * Tries the official download URL for the station's complete record,
 * falling back to the CEHQ JSON sommaire (~8 months) if unavailable.
 */

const CEHQ_HISTORICAL_URLS = [
  (id: string) =>
    `https://www.cehq.gouv.qc.ca/depot/suivihydro/historique/${id}_Q.txt`,
  (id: string) =>
    `https://www.cehq.gouv.qc.ca/depot/suivihydro/bd/${id}_Q.txt`,
];

const CEHQ_JSON_URL = "https://www.cehq.gouv.qc.ca/depot/suivihydro/bd/JSON";

export interface HistoricalFlowRecord {
  date: string; // YYYY-MM-DD
  flow: number; // m³/s
  remark: string;
}

/**
 * Parse MELCCFP text format into flow records.
 * Same format as the raw .txt files in datas/ (e.g., 060601_Q.txt).
 */
function parseMelccfpText(text: string): HistoricalFlowRecord[] {
  const lines = text.split("\n");
  const records: HistoricalFlowRecord[] = [];

  for (const line of lines) {
    // Match data rows: stationId  YYYY/MM/DD  flow  remark
    const match = line.match(
      /^\s*\d{6}\s+(\d{4}\/\d{2}\/\d{2})\s+([\d.]+)\s*(.*)/,
    );
    if (match) {
      const date = match[1].replace(/\//g, "-");
      const flow = parseFloat(match[2]);
      const remark = match[3].trim();
      if (!isNaN(flow) && flow > 0) {
        records.push({ date, flow, remark });
      }
    }
  }

  return records;
}

/**
 * Attempt to download full historical data from CEHQ.
 * Tries multiple URL patterns.
 */
async function fetchHistoricalText(
  stationId: string,
): Promise<HistoricalFlowRecord[] | null> {
  for (const urlFn of CEHQ_HISTORICAL_URLS) {
    const url = urlFn(stationId);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "WaterFlow-App/1.0" },
      });
      if (!res.ok) continue;

      const text = await res.text();
      // Validate it looks like MELCCFP data (has station ID in data rows)
      if (!text.includes(stationId)) continue;

      const records = parseMelccfpText(text);
      if (records.length > 0) {
        console.log(
          `[cehq-historical] Station ${stationId}: ${records.length} records from ${url}`,
        );
        return records;
      }
    } catch {
      // Try next URL
    }
  }

  return null;
}

/**
 * Fetch daily flow from CEHQ JSON sommaire (~8 months).
 * Used as fallback when full historical download isn't available.
 */
async function fetchCehqSommaire(
  stationId: string,
): Promise<HistoricalFlowRecord[]> {
  try {
    const res = await fetch(`${CEHQ_JSON_URL}/${stationId}.json`);
    if (!res.ok) return [];

    const data = (await res.json()) as {
      sommaire?: Array<{
        dateDonneeHydrique: string;
        noSeqDefinitionDonnee: number;
        valeurDonneeHydrique: number;
      }>;
    };

    const entries = data.sommaire ?? [];
    const records = entries
      .filter((e) => e.noSeqDefinitionDonnee === 10.0 && e.valeurDonneeHydrique > 0)
      .map((e) => ({
        date: e.dateDonneeHydrique.slice(0, 10),
        flow: e.valeurDonneeHydrique,
        remark: "",
      }));

    console.log(
      `[cehq-historical] Station ${stationId}: ${records.length} records from JSON sommaire`,
    );
    return records;
  } catch {
    return [];
  }
}

/**
 * Fetch all available historical flow data for a station.
 * First tries full MELCCFP download, falls back to CEHQ JSON sommaire.
 */
export async function fetchHistoricalFlowData(
  stationId: string,
  onProgress?: (message: string) => void,
): Promise<HistoricalFlowRecord[]> {
  onProgress?.(`Trying full historical download for station ${stationId}...`);

  const fullRecords = await fetchHistoricalText(stationId);
  if (fullRecords && fullRecords.length > 0) {
    const firstDate = fullRecords[0].date;
    const lastDate = fullRecords[fullRecords.length - 1].date;
    onProgress?.(
      `Downloaded ${fullRecords.length} records (${firstDate} to ${lastDate})`,
    );
    return fullRecords;
  }

  onProgress?.("Full download unavailable, using CEHQ JSON sommaire (~8 months)...");
  const sommaire = await fetchCehqSommaire(stationId);
  if (sommaire.length > 0) {
    onProgress?.(`Got ${sommaire.length} records from CEHQ sommaire`);
  } else {
    onProgress?.("No historical flow data available from CEHQ");
  }
  return sommaire;
}
