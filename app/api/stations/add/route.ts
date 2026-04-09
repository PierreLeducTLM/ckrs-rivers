import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";

const CEHQ_JSON_URL = "https://www.cehq.gouv.qc.ca/depot/suivihydro/bd/JSON";

interface CehqStationData {
  noStation: string;
  nomStation: string;
  nomPlanEau: string;
  descStation: string;
  bassin: string;
  regimeEcoulement: string;
  municipalite: string;
  indDiffusionDebitStation: string;
}

async function geocodeMunicipality(
  municipality: string,
): Promise<{ lat: number; lon: number } | null> {
  const query = `${municipality}, Québec, Canada`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "WaterFlow-App/1.0" },
    });
    if (!res.ok) return null;

    const results = (await res.json()) as { lat: string; lon: string }[];
    if (results.length === 0) return null;

    return {
      lat: parseFloat(results[0].lat),
      lon: parseFloat(results[0].lon),
    };
  } catch {
    return null;
  }
}

function parseCatchmentArea(bassin: string): number | null {
  const match = bassin.match(/([\d\s]+)\s*km/);
  if (!match) return null;
  return parseInt(match[1].replace(/\s/g, ""), 10);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      stationId: string;
      name?: string;
      lat?: number;
      lon?: number;
    };

    const { stationId } = body;

    if (!stationId || !/^\d{6}$/.test(stationId)) {
      return Response.json(
        { error: "Invalid station ID. Must be a 6-digit number (e.g., 060601)." },
        { status: 400 },
      );
    }

    // Find existing rows with the same CEHQ station number to generate a unique ID
    const existing = (await sql(
      `SELECT id FROM stations WHERE station_number = $1 OR id = $1 ORDER BY id`,
      [stationId],
    )) as Array<{ id: string }>;

    let internalId: string;
    if (existing.length === 0) {
      internalId = stationId;
    } else {
      let maxSuffix = 1;
      for (const row of existing) {
        const parts = row.id.split("_");
        if (parts.length === 2) {
          const n = parseInt(parts[1], 10);
          if (n > maxSuffix) maxSuffix = n;
        }
      }
      internalId = `${stationId}_${maxSuffix + 1}`;
    }

    // Fetch metadata from CEHQ JSON
    console.log(`[add-station] Fetching CEHQ metadata for station ${stationId}...`);
    const cehqRes = await fetch(`${CEHQ_JSON_URL}/${stationId}.json`);

    if (!cehqRes.ok) {
      return Response.json(
        { error: `Station ${stationId} not found on CEHQ (HTTP ${cehqRes.status}).` },
        { status: 404 },
      );
    }

    const cehqData = (await cehqRes.json()) as CehqStationData;

    // Check if station has flow data
    if (cehqData.indDiffusionDebitStation !== "O") {
      return Response.json(
        { error: `Station ${stationId} does not publish flow data.` },
        { status: 400 },
      );
    }

    // Build station name (use custom name if provided)
    const name = body.name?.trim() || (cehqData.nomPlanEau
      ? `${cehqData.nomPlanEau} - ${cehqData.descStation}`
      : `${cehqData.nomStation} - ${cehqData.descStation}`);

    const catchmentArea = parseCatchmentArea(cehqData.bassin);

    // Get coordinates: user-provided or geocode from municipality
    let lat = body.lat ?? null;
    let lon = body.lon ?? null;

    if (lat === null || lon === null) {
      console.log(`[add-station] Geocoding municipality: ${cehqData.municipalite}...`);
      const geo = await geocodeMunicipality(cehqData.municipalite);
      if (geo) {
        lat = geo.lat;
        lon = geo.lon;
        console.log(`[add-station] Geocoded to ${lat}, ${lon}`);
      } else {
        return Response.json(
          {
            error: `Could not determine coordinates for station ${stationId}. Please provide lat/lon manually.`,
            metadata: { name, catchmentArea, municipality: cehqData.municipalite },
          },
          { status: 422 },
        );
      }
    }

    // Insert into database — immediately ready (no model training needed)
    await sql(
      `INSERT INTO stations (id, station_number, name, lat, lon, catchment_area_km2, regime, municipality, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ready')`,
      [internalId, stationId, name, lat, lon, catchmentArea, cehqData.regimeEcoulement, cehqData.municipalite],
    );

    console.log(`[add-station] Station ${internalId} (CEHQ ${stationId}) added: ${name} (${lat}, ${lon})`);

    return Response.json({
      success: true,
      station: { id: internalId, name, lat, lon, catchmentArea },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
