import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";

async function geocodeCity(
  city: string,
): Promise<{ lat: number; lon: number } | null> {
  const query = `${city}, Québec, Canada`;
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const body = (await request.json()) as {
    name?: string;
    paddling_min?: number | null;
    paddling_ideal?: number | null;
    paddling_max?: number | null;
    weather_city?: string | null;
  };

  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  let idx = 1;

  if (body.name !== undefined) {
    sets.push(`name = $${idx++}`);
    values.push(body.name);
  }
  if (body.paddling_min !== undefined) {
    sets.push(`paddling_min = $${idx++}`);
    values.push(body.paddling_min);
  }
  if (body.paddling_ideal !== undefined) {
    sets.push(`paddling_ideal = $${idx++}`);
    values.push(body.paddling_ideal);
  }
  if (body.paddling_max !== undefined) {
    sets.push(`paddling_max = $${idx++}`);
    values.push(body.paddling_max);
  }

  // Handle weather city override with geocoding
  if (body.weather_city !== undefined) {
    if (body.weather_city === null || body.weather_city.trim() === "") {
      // Clear the override — revert to station coordinates
      sets.push(`weather_city = $${idx++}`);
      values.push(null);
      sets.push(`weather_lat = $${idx++}`);
      values.push(null);
      sets.push(`weather_lon = $${idx++}`);
      values.push(null);
    } else {
      const geo = await geocodeCity(body.weather_city.trim());
      if (!geo) {
        return Response.json(
          { error: `Could not geocode "${body.weather_city}". Try a different city name.` },
          { status: 422 },
        );
      }
      sets.push(`weather_city = $${idx++}`);
      values.push(body.weather_city.trim());
      sets.push(`weather_lat = $${idx++}`);
      values.push(geo.lat);
      sets.push(`weather_lon = $${idx++}`);
      values.push(geo.lon);
    }
  }

  if (sets.length === 0) {
    return Response.json({ error: "No fields to update" }, { status: 400 });
  }

  sets.push(`updated_at = now()`);
  values.push(id);

  await sql(
    `UPDATE stations SET ${sets.join(", ")} WHERE id = $${idx}`,
    values,
  );

  return Response.json({ success: true });
}
