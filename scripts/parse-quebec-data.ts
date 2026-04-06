/**
 * Parse Quebec MELCCFP hydrometric text files into clean CSV + station JSON.
 *
 *   npx tsx scripts/parse-quebec-data.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const INPUT_DIR = join(process.cwd(), "datas");
const OUTPUT_DIR = join(process.cwd(), "datas", "parsed");

interface StationMeta {
  id: string;
  name: string;
  catchmentArea: number | null;
  regime: string;
  lat: number;
  lon: number;
}

interface FlowRecord {
  date: string; // YYYY-MM-DD
  flow: number;
  remark: string;
}

function parseDMS(dms: string): number {
  // Parse "48° 22' 32"" or "-71° 59' 48""
  const match = dms.match(/(-?\d+)°\s*(\d+)'\s*(\d+)"/);
  if (!match) return 0;
  const deg = parseInt(match[1]);
  const min = parseInt(match[2]);
  const sec = parseInt(match[3]);
  const sign = deg < 0 ? -1 : 1;
  return sign * (Math.abs(deg) + min / 60 + sec / 3600);
}

function parseFile(filename: string): { meta: StationMeta; records: FlowRecord[] } {
  const raw = readFileSync(join(INPUT_DIR, filename), "utf-8");
  const lines = raw.split("\n");

  // Parse header
  let id = "";
  let name = "";
  let catchmentArea: number | null = null;
  let regime = "";
  let lat = 0;
  let lon = 0;

  for (const line of lines.slice(0, 10)) {
    const stationMatch = line.match(/Station:\s+(\d+)\s+(.+?)(?:\s{2,}|$)/);
    if (stationMatch) {
      id = stationMatch[1];
      name = stationMatch[2].trim();
    }

    const basinMatch = line.match(/Bassin versant:\s+(\d+)\s*km/);
    if (basinMatch) {
      catchmentArea = parseInt(basinMatch[1]);
    }

    const regimeMatch = line.match(/Régime:\s+(.+?)(?:\s{2,}|$)/);
    if (regimeMatch) {
      regime = regimeMatch[1].trim();
    }

    const coordMatch = line.match(
      /Coordonnées:.*?(\d+°\s*\d+'\s*\d+")\s*\/\/\s*(-?\d+°\s*\d+'\s*\d+")/,
    );
    if (coordMatch) {
      lat = parseDMS(coordMatch[1]);
      lon = parseDMS(coordMatch[2]);
    }
  }

  // Parse data rows
  const records: FlowRecord[] = [];
  for (const line of lines) {
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

  return {
    meta: { id, name, catchmentArea, regime, lat, lon },
    records,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

mkdirSync(OUTPUT_DIR, { recursive: true });

// 061029 excluded: dam-controlled river (Régime: Influencé)
const files = ["060601_Q.txt", "060704_Q.txt", "061502_Q.txt"];
const allStations: StationMeta[] = [];

for (const file of files) {
  console.log(`\nParsing ${file}...`);
  const { meta, records } = parseFile(file);
  allStations.push(meta);

  // Write CSV
  const csvLines = ["date,flow_m3s,remark"];
  for (const r of records) {
    csvLines.push(`${r.date},${r.flow},${r.remark}`);
  }
  const csvPath = join(OUTPUT_DIR, `${meta.id}_flow.csv`);
  writeFileSync(csvPath, csvLines.join("\n") + "\n");

  // Stats
  const dates = records.map((r) => r.date);
  const flows = records.map((r) => r.flow);
  const recentRecords = records.filter((r) => r.date >= "2022-01-01");

  console.log(`  Station: ${meta.id} — ${meta.name}`);
  console.log(`  Coords:  ${meta.lat.toFixed(4)}°N, ${meta.lon.toFixed(4)}°W`);
  console.log(`  Catchment: ${meta.catchmentArea} km², Regime: ${meta.regime}`);
  console.log(`  Records: ${records.length} (${dates[0]} to ${dates[dates.length - 1]})`);
  console.log(`  Recent (2022+): ${recentRecords.length} records`);
  console.log(
    `  Flow range: ${Math.min(...flows).toFixed(2)} – ${Math.max(...flows).toFixed(2)} m³/s`,
  );
  console.log(
    `  Flow mean: ${(flows.reduce((a, b) => a + b, 0) / flows.length).toFixed(2)} m³/s`,
  );
  console.log(`  → Saved to ${csvPath}`);
}

// Write stations JSON
const stationsPath = join(OUTPUT_DIR, "stations.json");
writeFileSync(stationsPath, JSON.stringify(allStations, null, 2) + "\n");
console.log(`\n→ Saved station metadata to ${stationsPath}`);
console.log(`\nDone! ${allStations.length} stations parsed.`);
