import { NextRequest } from "next/server";
import { refreshStation } from "@/lib/data/refresh-station";

/**
 * POST /api/rivers/[id]/refresh
 *
 * Fetches fresh CEHQ real-time data + forecast + weather and caches it.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await refreshStation(id);

  if (!result.success) {
    const status = result.error === "Station not found" ? 404 : 500;
    return Response.json({ error: result.error }, { status });
  }

  return Response.json({ success: true, generatedAt: result.generatedAt });
}
