import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";

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
