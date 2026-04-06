import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getStationById, getModel, getRealtimeData } from "@/lib/data/rivers";
import { generateHindcast } from "@/lib/prediction/hindcast";

const PARSED_DIR = join(process.cwd(), "datas", "parsed");

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Load all CSV flow readings for a station. */
function loadAllFlowReadings(
  stationId: string,
): { date: string; flow: number }[] {
  const csvPath = join(PARSED_DIR, `${stationId}_flow.csv`);
  let csv: string;
  try {
    csv = readFileSync(csvPath, "utf-8");
  } catch {
    return [];
  }

  const lines = csv.trim().split("\n").slice(1);
  const readings: { date: string; flow: number }[] = [];

  for (const line of lines) {
    const [date, flowStr] = line.split(",");
    if (!date || !flowStr) continue;
    const flow = parseFloat(flowStr);
    if (isNaN(flow) || flow <= 0) continue;
    readings.push({ date, flow });
  }

  return readings;
}

/**
 * Merge CSV readings with real-time CEHQ daily averages.
 * Real-time data wins for overlapping dates (it's fresher).
 */
async function loadMergedReadings(
  stationId: string,
): Promise<{ date: string; flow: number }[]> {
  const csvReadings = loadAllFlowReadings(stationId);

  // Build a map from CSV data
  const byDate = new Map<string, number>();
  for (const r of csvReadings) {
    byDate.set(r.date, r.flow);
  }

  // Overlay real-time CEHQ daily averages (last ~7 days)
  try {
    const realtime = await getRealtimeData(stationId);
    for (const [date, avgFlow] of realtime.dailyAverages) {
      byDate.set(date, avgFlow);
    }
  } catch {
    // CEHQ unavailable — use CSV only
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, flow]) => ({ date, flow }));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const station = getStationById(id);
    if (!station) {
      return Response.json({ error: "Station not found" }, { status: 404 });
    }

    // Parse date range from query params
    const searchParams = request.nextUrl.searchParams;
    const today = new Date().toISOString().slice(0, 10);

    const startDate = searchParams.get("start") ?? addDays(today, -30);
    const endDate = searchParams.get("end") ?? today;

    // Load CSV + real-time CEHQ merged readings
    const allReadings = await loadMergedReadings(id);

    // Filter observed data for the requested range
    const observed = allReadings.filter(
      (r) => r.date >= startDate && r.date <= endDate,
    );

    // Generate hindcast predictions
    const model = getModel();
    const hindcast = await generateHindcast({
      station,
      model,
      startDate,
      endDate,
      flowReadings: allReadings,
    });

    // Compute available date range (CSV + realtime)
    const dateRange = {
      earliest: allReadings.length > 0 ? allReadings[0].date : startDate,
      latest: allReadings.length > 0 ? allReadings[allReadings.length - 1].date : endDate,
    };

    return Response.json({
      stationId: id,
      stationName: station.name,
      startDate,
      endDate,
      dateRange,
      observed,
      hindcast,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
