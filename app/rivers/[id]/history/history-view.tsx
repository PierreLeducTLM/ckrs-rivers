"use client";

import { useState, useCallback } from "react";
import HistoryChart, { type HistoryChartPoint } from "./history-chart";
import ComparisonTable from "./comparison-table";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ObservedPoint {
  date: string;
  flow: number;
}

interface HindcastPoint {
  date: string;
  predicted: number;
  predictedLow: number;
  predictedHigh: number;
}

interface HistoryData {
  observed: ObservedPoint[];
  hindcast: HindcastPoint[];
  startDate: string;
  endDate: string;
}

interface ForecastDay {
  date: string;
  flow: number;
  flowLow: number;
  flowHigh: number;
}

interface HistoryViewProps {
  stationId: string;
  initialData: HistoryData;
  forecastDays: ForecastDay[];
  todayDate: string;
  dateRange: { earliest: string; latest: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatLabel(date: string): string {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

function formatLabelLong(date: string): string {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function mergeChartData(
  observed: ObservedPoint[],
  hindcast: HindcastPoint[],
): HistoryChartPoint[] {
  // Build maps
  const obsMap = new Map(observed.map((o) => [o.date, o.flow]));
  const predMap = new Map(
    hindcast.map((h) => [h.date, h]),
  );

  // Collect all dates
  const allDates = new Set([
    ...observed.map((o) => o.date),
    ...hindcast.map((h) => h.date),
  ]);

  const sorted = [...allDates].sort();

  return sorted.map((date) => {
    const obs = obsMap.get(date) ?? null;
    const pred = predMap.get(date);

    return {
      date,
      label: formatLabel(date),
      observed: obs,
      predicted: pred?.predicted ?? null,
      predictedLow: pred?.predictedLow ?? null,
      predictedHigh: pred?.predictedHigh ?? null,
      confidenceRange:
        pred ? [pred.predictedLow, pred.predictedHigh] as [number, number] : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HistoryView({
  stationId,
  initialData,
  forecastDays,
  todayDate,
  dateRange,
}: HistoryViewProps) {
  const [data, setData] = useState<HistoryData>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const windowSize = 30;

  const navigate = useCallback(
    async (startDate: string, endDate: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/rivers/${stationId}/history?start=${startDate}&end=${endDate}`,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error ?? `HTTP ${res.status}`,
          );
        }
        const json = (await res.json()) as HistoryData;
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    },
    [stationId],
  );

  const handlePrev = () => {
    const newEnd = addDays(data.startDate, -1);
    const newStart = addDays(newEnd, -windowSize + 1);
    navigate(newStart, newEnd);
  };

  const handleNext = () => {
    const newStart = addDays(data.endDate, 1);
    const newEnd = addDays(newStart, windowSize - 1);
    navigate(newStart, newEnd);
  };

  const handleReset = () => {
    const end = todayDate;
    const start = addDays(end, -windowSize + 1);
    navigate(start, end);
  };

  // Build chart data
  const chartData = mergeChartData(data.observed, data.hindcast);

  // Can navigate?
  const canPrev = data.startDate > dateRange.earliest;
  const canNext = data.endDate < todayDate;

  // Build ±7 day comparison data
  const obsMap = new Map(data.observed.map((o) => [o.date, o.flow]));
  const predMap = new Map(
    data.hindcast.map((h) => [h.date, h]),
  );

  const pastDays = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(todayDate, -(7 - i));
    const obs = obsMap.get(date) ?? null;
    const pred = predMap.get(date);
    return {
      date,
      label: formatLabelLong(date),
      observed: obs,
      predicted: pred?.predicted ?? null,
      predictedLow: pred?.predictedLow ?? null,
      predictedHigh: pred?.predictedHigh ?? null,
      isPast: true,
    };
  });

  const futureDaysData = forecastDays.slice(0, 7).map((f) => ({
    date: f.date,
    label: formatLabelLong(f.date),
    observed: null,
    predicted: f.flow,
    predictedLow: f.flowLow,
    predictedHigh: f.flowHigh,
    isPast: false,
  }));

  // Date range display
  const rangeStart = new Date(data.startDate + "T00:00:00Z").toLocaleDateString(
    "en-CA",
    { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" },
  );
  const rangeEnd = new Date(data.endDate + "T00:00:00Z").toLocaleDateString(
    "en-CA",
    { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" },
  );

  return (
    <div className="space-y-6">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={handlePrev}
          disabled={!canPrev || loading}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
          Previous
        </button>

        <div className="text-center">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {rangeStart} &mdash; {rangeEnd}
          </p>
          {canNext && (
            <button
              onClick={handleReset}
              className="mt-0.5 text-xs text-blue-500 hover:text-blue-400"
            >
              Back to today
            </button>
          )}
        </div>

        <button
          onClick={handleNext}
          disabled={!canNext || loading}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Next
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
              d="M8.25 4.5l7.5 7.5-7.5 7.5"
            />
          </svg>
        </button>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-zinc-500 dark:text-zinc-400">
          <svg
            className="h-4 w-4 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Loading historical data...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Chart */}
      {!loading && chartData.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Observed vs Model Estimate
          </h2>
          <HistoryChart data={chartData} />
        </section>
      )}

      {/* ±7 days comparison */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          7-Day Comparison
        </h2>
        <ComparisonTable pastDays={pastDays} futureDays={futureDaysData} />
      </section>
    </div>
  );
}
