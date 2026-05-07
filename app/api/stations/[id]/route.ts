import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";
import { RapidSchema, type Rapid } from "@/lib/domain/river-station";
import { z } from "zod";

async function geocodeCity(
  city: string,
): Promise<{ lat: number; lon: number } | null> {
  const query = `${city}, Québec, Canada`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "FlowCast-App/1.0" },
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
    put_in_lat?: number | null;
    put_in_lon?: number | null;
    take_out_lat?: number | null;
    take_out_lon?: number | null;
    river_path?: [number, number][] | null;
    rapid_class?: string | null;
    description?: string | null;
    rapids?: Rapid[];
    approved?: boolean;
    hidden?: boolean;
    unlock?: boolean;
  };

  // Approved-lock: if the river is currently approved and this request would
  // change anything other than the approved/hidden flags, require an explicit
  // unlock=true in the body. The lock is intentionally easy to bypass — its
  // purpose is to make accidental edits to vetted content impossible.
  const lockEditableFields = [
    body.name,
    body.paddling_min,
    body.paddling_ideal,
    body.paddling_max,
    body.weather_city,
    body.put_in_lat,
    body.put_in_lon,
    body.take_out_lat,
    body.take_out_lon,
    body.river_path,
    body.rapid_class,
    body.description,
    body.rapids,
  ];
  const touchesLockedField = lockEditableFields.some((v) => v !== undefined);

  if (touchesLockedField && body.unlock !== true) {
    const rows = (await sql(
      `SELECT approved FROM stations WHERE id = $1`,
      [id],
    )) as { approved: boolean | null }[];
    if (rows.length === 0) {
      return Response.json({ error: "Station not found" }, { status: 404 });
    }
    if (rows[0].approved === true) {
      return Response.json(
        { error: "River is approved — unlock first" },
        { status: 423 },
      );
    }
  }

  const sets: string[] = [];
  const values: (string | number | boolean | null)[] = [];
  let idx = 1;

  if (body.name !== undefined) {
    if (!body.name || body.name.trim() === "") {
      return Response.json({ error: "Station name cannot be empty" }, { status: 400 });
    }
    sets.push(`name = $${idx++}`);
    values.push(body.name.trim());
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

  if (body.put_in_lat !== undefined) {
    sets.push(`put_in_lat = $${idx++}`);
    values.push(body.put_in_lat);
  }
  if (body.put_in_lon !== undefined) {
    sets.push(`put_in_lon = $${idx++}`);
    values.push(body.put_in_lon);
  }
  if (body.take_out_lat !== undefined) {
    sets.push(`take_out_lat = $${idx++}`);
    values.push(body.take_out_lat);
  }
  if (body.take_out_lon !== undefined) {
    sets.push(`take_out_lon = $${idx++}`);
    values.push(body.take_out_lon);
  }
  if (body.river_path !== undefined) {
    sets.push(`river_path = $${idx++}`);
    values.push(body.river_path ? JSON.stringify(body.river_path) : null);
  }
  if (body.rapid_class !== undefined) {
    sets.push(`rapid_class = $${idx++}`);
    values.push(body.rapid_class);
  }
  if (body.description !== undefined) {
    sets.push(`description = $${idx++}`);
    values.push(body.description);
  }

  if (body.rapids !== undefined) {
    const parsed = z.array(RapidSchema).safeParse(body.rapids);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid rapids payload", details: parsed.error.issues },
        { status: 400 },
      );
    }
    sets.push(`rapids = $${idx++}`);
    values.push(JSON.stringify(parsed.data));
  }

  if (body.approved !== undefined) {
    sets.push(`approved = $${idx++}`);
    values.push(body.approved);
    if (body.approved === true) {
      sets.push(`approved_at = now()`);
    }
  }

  if (body.hidden !== undefined) {
    sets.push(`hidden = $${idx++}`);
    values.push(body.hidden);
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const rows = await sql(`SELECT id, approved FROM stations WHERE id = $1`, [id]) as {
    id: string;
    approved: boolean | null;
  }[];
  if (rows.length === 0) {
    return Response.json({ error: "Station not found" }, { status: 404 });
  }

  if (rows[0].approved === true) {
    return Response.json(
      { error: "River is approved — unapprove before deleting" },
      { status: 423 },
    );
  }

  await sql(`DELETE FROM stations WHERE id = $1`, [id]);

  return Response.json({ success: true });
}
