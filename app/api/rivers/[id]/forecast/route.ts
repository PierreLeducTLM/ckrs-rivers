import { NextRequest } from "next/server";
import { getStationById, getRecentReadings, getModel } from "@/lib/data/rivers";
import { generateForecast } from "@/lib/prediction/forecast";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const station = getStationById(id);
    if (!station) {
      return Response.json({ error: "Station not found" }, { status: 404 });
    }

    const model = getModel();
    const recentFlowReadings = getRecentReadings(id);

    const result = await generateForecast({
      station,
      model,
      recentFlowReadings,
    });

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
