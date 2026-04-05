import Link from "next/link";
import { getStationById, getRecentReadings, getModel } from "@/lib/data/rivers";
import { generateForecast } from "@/lib/prediction/forecast";
import { notFound } from "next/navigation";
import type { DailyForecast, ConfidenceLevel } from "@/lib/prediction/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: string): string {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function confidenceBadge(level: ConfidenceLevel) {
  const styles: Record<ConfidenceLevel, string> = {
    high: "bg-emerald-500/10 text-emerald-400",
    medium: "bg-amber-500/10 text-amber-400",
    low: "bg-red-500/10 text-red-400",
  };

  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[level]}`}
    >
      {level}
    </span>
  );
}

function FlowBar({
  flow,
  flowLow,
  flowHigh,
  maxFlow,
}: {
  flow: number;
  flowLow: number;
  flowHigh: number;
  maxFlow: number;
}) {
  const scale = (v: number) => Math.min((v / maxFlow) * 100, 100);

  const lowPct = scale(flowLow);
  const highPct = scale(flowHigh);
  const pointPct = scale(flow);

  return (
    <div className="relative h-6 w-full rounded bg-zinc-800/40">
      {/* Confidence range band */}
      <div
        className="absolute top-0 h-full rounded bg-blue-500/20"
        style={{ left: `${lowPct}%`, width: `${Math.max(highPct - lowPct, 0.5)}%` }}
      />
      {/* Point prediction bar */}
      <div
        className="absolute top-0 h-full rounded bg-blue-500"
        style={{ width: `${pointPct}%` }}
      />
      {/* Flow label */}
      <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-white drop-shadow-sm">
        {flow.toFixed(1)} m&sup3;/s
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function RiverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const station = getStationById(id);
  if (!station) notFound();

  const model = getModel();
  const recentReadings = getRecentReadings(id);

  // Last observed flow (most recent reading)
  const lastReading = recentReadings.at(-1);
  const lastObservedFlow =
    lastReading?.flow !== undefined ? Number(lastReading.flow) : null;
  const lastObservedDate = lastReading
    ? lastReading.timestamp.slice(0, 10)
    : null;

  // Generate forecast
  let forecasts: DailyForecast[] = [];
  let forecastError: string | null = null;

  try {
    const result = await generateForecast({
      station,
      model,
      recentFlowReadings: recentReadings,
    });
    forecasts = result.forecasts;
  } catch (err) {
    forecastError =
      err instanceof Error
        ? err.message
        : "An unexpected error occurred while generating the forecast.";
  }

  // Max flow across all forecasts for bar scaling
  const maxFlow = forecasts.length > 0
    ? Math.max(...forecasts.map((f) => f.flowHigh))
    : 1;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          href="/"
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
          Back to Dashboard
        </Link>

        {/* River header */}
        <header className="mt-6">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {station.name}
          </h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
            <span>
              Station{" "}
              <span className="font-mono text-zinc-700 dark:text-zinc-300">
                {station.id}
              </span>
            </span>
            <span className="hidden sm:inline" aria-hidden="true">
              &middot;
            </span>
            <span>
              {Number(station.coordinates.lat).toFixed(4)}N,{" "}
              {Number(station.coordinates.lon).toFixed(4)}W
            </span>
            {station.catchmentArea !== undefined && (
              <>
                <span className="hidden sm:inline" aria-hidden="true">
                  &middot;
                </span>
                <span>
                  Catchment{" "}
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {Number(station.catchmentArea).toLocaleString()} km&sup2;
                  </span>
                </span>
              </>
            )}
          </div>
        </header>

        {/* Last observed flow */}
        {lastObservedFlow !== null && lastObservedDate !== null && (
          <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Last Observed Flow
            </h2>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-4xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                {lastObservedFlow.toFixed(1)}
              </span>
              <span className="text-lg text-zinc-500 dark:text-zinc-400">
                m&sup3;/s
              </span>
              <span className="ml-auto text-sm text-zinc-400 dark:text-zinc-500">
                {formatDate(lastObservedDate)}
              </span>
            </div>
          </section>
        )}

        {/* Forecast error */}
        {forecastError !== null && (
          <section className="mt-8 rounded-xl border border-red-300 bg-red-50 p-5 dark:border-red-800 dark:bg-red-950/30">
            <h2 className="text-sm font-semibold text-red-800 dark:text-red-300">
              Forecast Unavailable
            </h2>
            <p className="mt-1 text-sm text-red-700 dark:text-red-400">
              {forecastError}
            </p>
          </section>
        )}

        {/* 7-day forecast */}
        {forecasts.length > 0 && (
          <>
            {/* Forecast table */}
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                7-Day Flow Forecast
              </h2>

              <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-right">Flow (m&sup3;/s)</th>
                      <th className="px-4 py-3 text-right">Range</th>
                      <th className="px-4 py-3 text-center">Horizon</th>
                      <th className="px-4 py-3 text-center">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {forecasts.map((day) => (
                      <tr
                        key={day.date}
                        className="bg-white transition-colors hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                          {formatDate(day.date)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                          {Number(day.flow).toFixed(1)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                          {Number(day.flowLow).toFixed(1)} &ndash;{" "}
                          {Number(day.flowHigh).toFixed(1)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-center font-mono text-xs text-zinc-500 dark:text-zinc-400">
                          Day+{day.horizon}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-center">
                          {confidenceBadge(day.confidence)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Visual flow bars */}
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Flow Visualization
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Dark bar shows predicted flow. Light band shows the confidence
                range.
              </p>

              <div className="mt-4 space-y-3">
                {forecasts.map((day) => (
                  <div key={day.date} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      {formatDate(day.date)}
                    </span>
                    <div className="flex-1">
                      <FlowBar
                        flow={Number(day.flow)}
                        flowLow={Number(day.flowLow)}
                        flowHigh={Number(day.flowHigh)}
                        maxFlow={maxFlow}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right">
                      {confidenceBadge(day.confidence)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
