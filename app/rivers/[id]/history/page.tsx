import Link from "next/link";
import {
  getStationById,
  getRecentReadings,
  getRealtimeData,
  getModel,
} from "@/lib/data/rivers";
import { generateForecast } from "@/lib/prediction/forecast";
import { generateHindcast } from "@/lib/prediction/hindcast";
import { notFound } from "next/navigation";
import HistoryView from "./history-view";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PARSED_DIR = join(process.cwd(), "datas", "parsed");

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function loadCsvReadings(
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

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const station = getStationById(id);
  if (!station) notFound();

  const model = getModel();
  const today = new Date().toISOString().slice(0, 10);

  // Initial 30-day window
  const startDate = addDays(today, -30);
  const endDate = today;

  // Load CSV data + merge real-time CEHQ daily averages (last ~7 days)
  const csvReadings = loadCsvReadings(id);
  const byDate = new Map<string, number>();
  for (const r of csvReadings) {
    byDate.set(r.date, r.flow);
  }

  try {
    const realtime = await getRealtimeData(id);
    for (const [date, avgFlow] of realtime.dailyAverages) {
      byDate.set(date, avgFlow); // real-time wins over CSV
    }
  } catch {
    // CEHQ unavailable — use CSV only
  }

  const allReadings = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, flow]) => ({ date, flow }));

  // Filter observed data for the window
  const observed = allReadings.filter(
    (r) => r.date >= startDate && r.date <= endDate,
  );

  // Generate hindcast
  let hindcast: { date: string; predicted: number; predictedLow: number; predictedHigh: number }[] = [];
  try {
    hindcast = await generateHindcast({
      station,
      model,
      startDate,
      endDate,
      flowReadings: allReadings,
    });
  } catch {
    // Hindcast may fail if weather data is unavailable
  }

  // Generate forecast for the ±7 day comparison section
  let forecastDays: { date: string; flow: number; flowLow: number; flowHigh: number }[] = [];
  try {
    const recentReadings = await getRecentReadings(id);
    const result = await generateForecast({
      station,
      model,
      recentFlowReadings: recentReadings,
    });
    forecastDays = result.forecasts.map((f) => ({
      date: f.date,
      flow: f.flow,
      flowLow: f.flowLow,
      flowHigh: f.flowHigh,
    }));
  } catch {
    // Forecast may fail
  }

  // Date range (CSV + realtime merged)
  const dateRange = {
    earliest: allReadings.length > 0 ? allReadings[0].date : startDate,
    latest: allReadings.length > 0 ? allReadings[allReadings.length - 1].date : endDate,
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          href={`/rivers/${id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5L8.25 12l7.5-7.5"
            />
          </svg>
          Back to {station.name}
        </Link>

        {/* Header */}
        <header className="mt-6">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Historical Data
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {station.name} &mdash; Station{" "}
            <span className="font-mono">{station.id}</span>
          </p>
          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
            Compare observed flow against what the model would have predicted.
            Navigate through time using the arrows.
          </p>
        </header>

        {/* Interactive content */}
        <div className="mt-8">
          <HistoryView
            stationId={id}
            initialData={{
              observed,
              hindcast,
              startDate,
              endDate,
            }}
            forecastDays={forecastDays}
            todayDate={today}
            dateRange={dateRange}
          />
        </div>
      </div>
    </div>
  );
}
