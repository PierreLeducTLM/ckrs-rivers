import { NextRequest } from "next/server";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

interface OverpassNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
}

interface OverpassWay {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}

type OverpassElement = OverpassNode | OverpassWay;

function distSq(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = lat1 - lat2;
  const dLon = (lon1 - lon2) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return dLat * dLat + dLon * dLon;
}

function closestNodeIndex(
  coords: [number, number][],
  lat: number,
  lon: number,
): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = distSq(coords[i][0], coords[i][1], lat, lon);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      putInLat: number;
      putInLon: number;
      takeOutLat: number;
      takeOutLon: number;
    };

    const { putInLat, putInLon, takeOutLat, takeOutLon } = body;

    // Build bounding box with ~5km padding (~0.05 degrees)
    const pad = 0.05;
    const south = Math.min(putInLat, takeOutLat) - pad;
    const north = Math.max(putInLat, takeOutLat) + pad;
    const west = Math.min(putInLon, takeOutLon) - pad;
    const east = Math.max(putInLon, takeOutLon) + pad;

    const query = `
      [out:json][timeout:15];
      (
        way["waterway"~"river|stream"](${south},${west},${north},${east});
      );
      (._;>;);
      out body;
    `;

    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!res.ok) {
      return Response.json(
        { error: `Overpass API error (HTTP ${res.status})` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as { elements: OverpassElement[] };

    // Index nodes by id
    const nodeMap = new Map<number, [number, number]>();
    for (const el of data.elements) {
      if (el.type === "node") {
        nodeMap.set(el.id, [el.lat, el.lon]);
      }
    }

    // Build coordinate arrays for each way
    const ways = data.elements.filter(
      (el): el is OverpassWay => el.type === "way",
    );

    if (ways.length === 0) {
      return Response.json(
        { error: "No waterways found in this area. Try placing markers closer to a river." },
        { status: 404 },
      );
    }

    // Score each way: sum of min-distance to put-in and min-distance to take-out
    let bestWay: OverpassWay | null = null;
    let bestCoords: [number, number][] = [];
    let bestScore = Infinity;

    for (const way of ways) {
      const coords: [number, number][] = [];
      for (const nid of way.nodes) {
        const c = nodeMap.get(nid);
        if (c) coords.push(c);
      }
      if (coords.length < 2) continue;

      let minPutIn = Infinity;
      let minTakeOut = Infinity;
      for (const [lat, lon] of coords) {
        const dpi = distSq(lat, lon, putInLat, putInLon);
        const dto = distSq(lat, lon, takeOutLat, takeOutLon);
        if (dpi < minPutIn) minPutIn = dpi;
        if (dto < minTakeOut) minTakeOut = dto;
      }

      const score = minPutIn + minTakeOut;
      if (score < bestScore) {
        bestScore = score;
        bestWay = way;
        bestCoords = coords;
      }
    }

    if (!bestWay || bestCoords.length < 2) {
      return Response.json(
        { error: "Could not match a waterway to the given markers." },
        { status: 404 },
      );
    }

    // Trim to segment between put-in and take-out
    const piIdx = closestNodeIndex(bestCoords, putInLat, putInLon);
    const toIdx = closestNodeIndex(bestCoords, takeOutLat, takeOutLon);

    const start = Math.min(piIdx, toIdx);
    const end = Math.max(piIdx, toIdx);
    const segment = bestCoords.slice(start, end + 1);

    // If put-in is downstream (higher index), reverse so path goes put-in → take-out
    const path = piIdx > toIdx ? segment.reverse() : segment;

    return Response.json({
      path,
      riverName: bestWay.tags?.name ?? null,
      wayId: bestWay.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
