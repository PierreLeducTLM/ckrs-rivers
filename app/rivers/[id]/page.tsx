import Link from "next/link";
import { getStationById, getPaddlingLevels } from "@/lib/data/rivers";
import { sql } from "@/lib/db/client";
import { notFound } from "next/navigation";
import HourlyChart from "./hourly-chart";
import RefreshButton from "./refresh-button";

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

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Types for cached data
// ---------------------------------------------------------------------------

interface CachedForecast {
  lastFlow: { date: string; flow: number } | null;
  forecastDays: Array<{
    date: string;
    flow: number;
    flowLow: number;
    flowHigh: number;
  }>;
}

interface WeatherDay {
  date: string;
  tempMin: number;
  tempMax: number;
  tempMean: number;
  precipitation: number;
  snowfall: number;
  snowDepth: number;
}

interface HourlyPoint {
  timestamp: string;
  label: string;
  observed: number | null;
  cehqForecast: number | null;
  cehqLow: number | null;
  cehqHigh: number | null;
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

  const station = await getStationById(id);
  if (!station) notFound();

  const paddling = (await getPaddlingLevels()).get(id);

  // Load everything from cache — no external API calls on page load
  let cached: CachedForecast | null = null;
  let hourlyData: HourlyPoint[] = [];
  let weatherData: WeatherDay[] = [];
  let generatedAt: string | null = null;

  try {
    const cacheRows = await sql(
      `SELECT forecast_json, hourly_json, weather_json, generated_at::text FROM forecast_cache WHERE station_id = $1`,
      [id],
    ) as Array<{
      forecast_json: CachedForecast;
      hourly_json: HourlyPoint[] | null;
      weather_json: WeatherDay[] | null;
      generated_at: string;
    }>;

    if (cacheRows.length > 0) {
      cached = cacheRows[0].forecast_json;
      hourlyData = cacheRows[0].hourly_json ?? [];
      weatherData = cacheRows[0].weather_json ?? [];
      generatedAt = cacheRows[0].generated_at;
    }
  } catch {
    // Cache table may not have all columns yet
    try {
      const cacheRows = await sql(
        `SELECT forecast_json, hourly_json, generated_at::text FROM forecast_cache WHERE station_id = $1`,
        [id],
      ) as Array<{ forecast_json: CachedForecast; hourly_json: HourlyPoint[] | null; generated_at: string }>;
      if (cacheRows.length > 0) {
        cached = cacheRows[0].forecast_json;
        hourlyData = cacheRows[0].hourly_json ?? [];
        generatedAt = cacheRows[0].generated_at;
      }
    } catch {
      // No cache at all
    }
  }

  const lastFlow = cached?.lastFlow ?? null;
  const forecastDays = cached?.forecastDays ?? [];

  // Convert hourly data for the chart — only keep 2 days before today onward
  const twoDaysAgo = new Date();
  twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);
  const cutoff = twoDaysAgo.toISOString().slice(0, 10) + "T00:00:00Z";

  const chartData = hourlyData
    .filter((p) => p.timestamp >= cutoff)
    .map((p) => ({
      timestamp: p.timestamp,
      label: p.label,
      observed: p.observed,
      predicted: null,
      confidenceLow: p.cehqLow ?? null,
      confidenceHigh: p.cehqHigh ?? null,
      cehqForecast: p.cehqForecast,
    }));

  const nowTimestamp = new Date().toISOString();

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
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
              <span className="font-mono text-zinc-700 dark:text-zinc-300">{station.id}</span>
            </span>
            <span className="hidden sm:inline" aria-hidden="true">&middot;</span>
            <span>
              {Number(station.coordinates.lat).toFixed(4)}N,{" "}
              {Number(station.coordinates.lon).toFixed(4)}W
            </span>
            {station.catchmentArea !== undefined && (
              <>
                <span className="hidden sm:inline" aria-hidden="true">&middot;</span>
                <span>
                  Catchment{" "}
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {Number(station.catchmentArea).toLocaleString()} km&sup2;
                  </span>
                </span>
              </>
            )}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <RefreshButton stationId={id} />
            {generatedAt && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                Updated {timeAgo(generatedAt)}
              </span>
            )}
          </div>
        </header>

        {/* Last observed flow */}
        {lastFlow && (
          <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Last Observed Flow
            </h2>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-4xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                {lastFlow.flow.toFixed(1)}
              </span>
              <span className="text-lg text-zinc-500 dark:text-zinc-400">m&sup3;/s</span>
              <span className="ml-auto text-sm text-zinc-400 dark:text-zinc-500">
                {formatDate(lastFlow.date)}
              </span>
            </div>
          </section>
        )}

        {/* Hourly flow chart */}
        {chartData.length > 0 && (
          <section className="mt-6">
            <HourlyChart data={chartData} nowTimestamp={nowTimestamp} paddling={paddling} />
          </section>
        )}

        {/* Weather strip */}
        {weatherData.length > 0 && (() => {
          const days = weatherData
            .filter((w) => w.date >= new Date().toISOString().slice(0, 10))
            .slice(0, 7);

          function weatherIcon(w: WeatherDay) {
            if (w.snowfall > 0.5) return "\u2744\uFE0F"; // snowflake
            if (w.precipitation > 5) return "\uD83C\uDF27\uFE0F"; // rain cloud
            if (w.precipitation > 0.5) return "\uD83C\uDF26\uFE0F"; // sun behind rain cloud
            if (w.tempMax > 15) return "\u2600\uFE0F"; // sun
            if (w.tempMax > 5) return "\u26C5"; // sun behind cloud
            return "\u2601\uFE0F"; // cloud
          }

          return (
            <section className="mt-2">
              <div className="grid grid-cols-4 gap-1 text-center text-[11px] leading-tight sm:grid-cols-7 sm:gap-0">
                {days.map((w) => {
                  const isToday = w.date === new Date().toISOString().slice(0, 10);
                  return (
                    <div
                      key={w.date}
                      className={`rounded-lg px-1.5 py-2 sm:rounded-none sm:border-r sm:border-zinc-200 sm:dark:border-zinc-800 ${
                        isToday
                          ? "bg-blue-500/10 ring-1 ring-blue-500/20 sm:ring-0"
                          : "bg-zinc-100/50 dark:bg-zinc-900/50 sm:bg-transparent"
                      }`}
                    >
                      <div className="font-medium text-zinc-500 dark:text-zinc-400">
                        {isToday ? "Today" : new Date(w.date + "T00:00:00Z").toLocaleDateString("en-CA", { weekday: "short" })}
                        {" - "}
                        {new Date(w.date + "T00:00:00Z").toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                      </div>
                      <div className="mt-0.5 text-lg leading-none">{weatherIcon(w)}</div>
                      <div className="mt-1 tabular-nums text-zinc-700 dark:text-zinc-300">
                        <span className="text-blue-500">{w.tempMin.toFixed(0)}</span>
                        <span className="text-zinc-400">/</span>
                        <span className="text-red-500">{w.tempMax.toFixed(0)}</span>
                        <span className="text-zinc-400 dark:text-zinc-500">&deg;</span>
                      </div>
                      {w.precipitation > 0.1 && (
                        <div className="mt-0.5 tabular-nums text-blue-400">
                          {w.precipitation.toFixed(1)}mm
                        </div>
                      )}
                      {w.snowfall > 0.1 && (
                        <div className="tabular-nums text-sky-300">
                          {w.snowfall.toFixed(1)}cm
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })()}

        {/* No data state */}
        {!cached && (
          <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No data yet. Press Refresh to fetch flow data and forecast from CEHQ.
            </p>
          </section>
        )}

        {/* CEHQ Forecast table */}
        {forecastDays.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              CEHQ Forecast
            </h2>

            <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Flow (m&sup3;/s)</th>
                    <th className="px-4 py-3 text-right">Range</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {forecastDays.map((day) => (
                    <tr
                      key={day.date}
                      className="bg-white transition-colors hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                        {formatDate(day.date)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                        {day.flow.toFixed(1)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                        {day.flowLow.toFixed(1)} &ndash; {day.flowHigh.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
