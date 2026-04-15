"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useTranslation } from "@/lib/i18n/provider";
import { applyForecastCorrection, type ForecastCorrection } from "@/app/components/utils";

export interface HourlyChartPoint {
  timestamp: string;
  label: string;
  observed: number | null;
  predicted: number | null;
  confidenceLow: number | null;
  confidenceHigh: number | null;
  cehqForecast: number | null;
}

export interface PaddlingLevels {
  min?: number;
  ideal?: number;
  max?: number;
}

interface HourlyChartProps {
  data: HourlyChartPoint[];
  nowTimestamp: string;
  paddling?: PaddlingLevels;
  /**
   * Time-decaying multiplicative correction derived from recent observed/forecast
   * overlap. When inactive, the corrected line and its legend entry are suppressed.
   */
  correction?: ForecastCorrection;
}

function formatTick(epoch: number): string {
  const d = new Date(epoch);
  const h = d.getUTCHours();
  if (h === 0) {
    return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
  }
  return `${h.toString().padStart(2, "0")}:00`;
}

export default function HourlyChart({ data, nowTimestamp, paddling, correction }: HourlyChartProps) {
  const { t } = useTranslation();
  const nowTs = new Date(nowTimestamp).getTime();

  // Whether to draw the bias-corrected line.
  const showCorrected = correction?.active ?? false;

  // Add numeric timestamp for proportional x-axis spacing,
  // a [low, high] tuple for the CEHQ confidence band, and the
  // bias-corrected forecast (only for future points; decays back to CEHQ).
  const chartData = data.map((d) => {
    const ts = new Date(d.timestamp).getTime();
    let cehqCorrected: number | null = null;
    if (showCorrected && d.cehqForecast != null && ts > nowTs && correction) {
      const hoursAhead = (ts - nowTs) / (60 * 60 * 1000);
      cehqCorrected = applyForecastCorrection(d.cehqForecast, hoursAhead, correction);
    }
    return {
      ...d,
      ts,
      cehqRange: d.confidenceLow != null && d.confidenceHigh != null
        ? [d.confidenceLow, d.confidenceHigh]
        : undefined,
      cehqCorrected,
    };
  });

  const hasCorrectedLine = showCorrected && chartData.some((d) => d.cehqCorrected !== null);

  // Compute tight Y bounds from actual flow data
  const flowValues = data.flatMap((d) =>
    [d.observed, d.predicted, d.confidenceLow, d.confidenceHigh, d.cehqForecast].filter(
      (v): v is number => v !== null && v !== undefined,
    ),
  );
  if (hasCorrectedLine) {
    for (const d of chartData) {
      if (d.cehqCorrected != null) flowValues.push(d.cehqCorrected);
    }
  }
  const minDataFlow = flowValues.length > 0 ? Math.min(...flowValues) : 0;
  const maxDataFlow = flowValues.length > 0 ? Math.max(...flowValues) : 1;

  const dataRange = maxDataFlow - minDataFlow;
  const padY = Math.max(dataRange * 0.1, 0.5);
  const yMin = Math.max(0, Math.floor(minDataFlow - padY));
  const yMax = Math.ceil(maxDataFlow + padY);

  // Classify each threshold: in-range, above, or below
  const thresholds: { value: number; label: string; color: string; inRange: boolean; position: "above" | "below" | "in" }[] = [];
  if (paddling?.min !== undefined) {
    const v = paddling.min;
    thresholds.push({
      value: v, label: `Min ${v}`, color: "#4ADE80",
      inRange: v >= yMin && v <= yMax,
      position: v > yMax ? "above" : v < yMin ? "below" : "in",
    });
  }
  if (paddling?.ideal !== undefined) {
    const v = paddling.ideal;
    thresholds.push({
      value: v, label: `Ideal ${v}`, color: "#16A34A",
      inRange: v >= yMin && v <= yMax,
      position: v > yMax ? "above" : v < yMin ? "below" : "in",
    });
  }
  if (paddling?.max !== undefined) {
    const v = paddling.max;
    thresholds.push({
      value: v, label: `Max ${v}`, color: "#dc2626",
      inRange: v >= yMin && v <= yMax,
      position: v > yMax ? "above" : v < yMin ? "below" : "in",
    });
  }

  // Generate tick values every 12 hours
  const tsValues = chartData.map((d) => d.ts);
  const tsMin = Math.min(...tsValues);
  const tsMax = Math.max(...tsValues);
  const MS_12H = 12 * 60 * 60 * 1000;
  const firstTick = Math.ceil(tsMin / MS_12H) * MS_12H;
  const ticks: number[] = [];
  for (let t = firstTick; t <= tsMax; t += MS_12H) {
    ticks.push(t);
  }

  // Pre-formatted bias note: e.g. "Recent obs ×0.66 (fades over 24h)".
  const biasNote =
    hasCorrectedLine && correction?.ratio != null
      ? t("chart.biasNote", {
          ratio: correction.ratio.toFixed(2),
          hours: String(Math.round(correction.decayHours)),
        })
      : "";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {t("chart.title")}
      </h2>

      {/* Out-of-range threshold markers */}
      {thresholds.some((t) => t.position === "above") && (
        <div className="mb-1 flex flex-wrap gap-x-3 gap-y-0.5">
          {thresholds
            .filter((t) => t.position === "above")
            .map((t) => (
              <span
                key={t.label}
                className="flex items-center gap-1 text-[10px] font-medium"
                style={{ color: t.color }}
              >
                <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: t.color }} />
                {t.label} m&sup3;/s &uarr;
              </span>
            ))}
        </div>
      )}

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart
          data={chartData}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="cehqConfFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a855f7" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#a855f7" stopOpacity={0.08} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            opacity={0.08}
          />

          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={[tsMin, tsMax]}
            ticks={ticks}
            tickFormatter={formatTick}
            tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }}
            tickLine={false}
            axisLine={{ stroke: "currentColor", opacity: 0.15 }}
          />

          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }}
            tickLine={false}
            axisLine={{ stroke: "currentColor", opacity: 0.15 }}
            label={{
              value: "m³/s",
              angle: -90,
              position: "insideLeft",
              offset: 10,
              style: { fontSize: 10, fill: "currentColor", opacity: 0.5 },
            }}
          />

          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload as
                | (HourlyChartPoint & { ts: number; cehqCorrected: number | null })
                | undefined;
              if (!d) return null;
              return (
                <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    {new Date(d.timestamp).toLocaleString("en-CA", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                      timeZone: "UTC",
                    })}
                  </p>
                  {d.observed !== null && (
                    <p className="mt-0.5 text-blue-600">
                      {t("chart.observedLabel")}<span className="font-semibold">{d.observed.toFixed(1)} m&sup3;/s</span>
                    </p>
                  )}
                  {d.cehqForecast !== null && (
                    <p className="mt-0.5 text-purple-500">
                      {t("chart.cehqLabel")}<span className="font-semibold">{d.cehqForecast.toFixed(1)} m&sup3;/s</span>
                    </p>
                  )}
                  {d.cehqCorrected !== null && (
                    <p className="mt-0.5 text-teal-600 dark:text-teal-400">
                      {t("chart.cehqCorrectedLabel")}
                      <span className="font-semibold">{d.cehqCorrected.toFixed(1)} m&sup3;/s</span>
                      <span className="ml-1 text-[10px] text-zinc-500">({biasNote})</span>
                    </p>
                  )}
                  {d.confidenceLow !== null && d.confidenceHigh !== null && (
                    <p className="mt-0.5 text-zinc-500">
                      {t("chart.rangeLabel")}{d.confidenceLow.toFixed(1)} &ndash; {d.confidenceHigh.toFixed(1)}
                    </p>
                  )}
                </div>
              );
            }}
          />

          {/* Now reference line */}
          <ReferenceLine
            x={nowTs}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            strokeWidth={1.5}
          />

          {/* Paddling threshold lines */}
          {thresholds
            .filter((t) => t.inRange)
            .map((t) => (
              <ReferenceLine
                key={t.label}
                y={t.value}
                stroke={t.color}
                strokeDasharray="6 4"
                strokeWidth={1.5}
                label={{ value: t.label, position: "right", fill: t.color, fontSize: 10 }}
              />
            ))}

          {/* CEHQ confidence band (q25–q75) */}
          <Area
            dataKey="cehqRange"
            fill="url(#cehqConfFill)"
            stroke="#a855f7"
            strokeOpacity={0.2}
            strokeWidth={1}
            isAnimationActive={false}
            connectNulls={false}
          />

          {/* Observed flow */}
          <Line
            dataKey="observed"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />

          {/* CEHQ official forecast */}
          <Line
            dataKey="cehqForecast"
            stroke="#a855f7"
            strokeWidth={2}
            strokeDasharray="4 2"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />

          {/* Bias-corrected CEHQ forecast (only rendered when bias is non-trivial) */}
          {hasCorrectedLine && (
            <Line
              dataKey="cehqCorrected"
              stroke="#0d9488"
              strokeWidth={2.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 rounded bg-blue-600" />
          {t("chart.observed")}
        </span>
        {data.some((d) => d.cehqForecast !== null) && (
          <>
            <span className="flex items-center gap-1.5">
              <svg width="20" height="3" className="text-purple-500">
                <line x1="0" y1="1.5" x2="20" y2="1.5" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2" />
              </svg>
              {t("chart.cehqForecast")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded bg-purple-500/20" />
              {t("chart.q25q75")}
            </span>
          </>
        )}
        {hasCorrectedLine && (
          <span
            className="flex items-center gap-1.5"
            title={biasNote}
          >
            <span className="inline-block h-0.5 w-5 rounded bg-teal-600 dark:bg-teal-400" />
            <span className="text-teal-700 dark:text-teal-400">
              {t("chart.cehqCorrected")}
              <span className="ml-1 text-[10px] text-zinc-500 dark:text-zinc-400">({biasNote})</span>
            </span>
          </span>
        )}
        {thresholds.map((t) => (
          <span key={t.label} className="flex items-center gap-1.5">
            <svg width="20" height="2">
              <line x1="0" y1="1" x2="20" y2="1" stroke={t.color} strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            <span style={{ color: t.color }}>
              {t.label} m&sup3;/s
              {t.position === "above" && (
                <span className="ml-1 text-zinc-400">&uarr;</span>
              )}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
