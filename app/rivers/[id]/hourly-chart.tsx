"use client";

import { useEffect, useState } from "react";
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
   * overlap. When active, future CEHQ forecast values (and their Q25–Q75 band)
   * are adjusted in place — no separate line is drawn.
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

  // When a correction is active, adjust future CEHQ forecast values (and
  // their Q25–Q75 band) in place so the single purple line already reflects
  // "where CEHQ says we'll be, after bias-correction".
  const applyCorrection = correction?.active ?? false;
  const chartData = data.map((d) => {
    const ts = new Date(d.timestamp).getTime();
    let cehqForecast = d.cehqForecast;
    let confidenceLow = d.confidenceLow;
    let confidenceHigh = d.confidenceHigh;
    if (applyCorrection && correction && ts > nowTs) {
      const hoursAhead = (ts - nowTs) / (60 * 60 * 1000);
      if (cehqForecast != null) {
        cehqForecast = applyForecastCorrection(cehqForecast, hoursAhead, correction);
      }
      if (confidenceLow != null) {
        confidenceLow = applyForecastCorrection(confidenceLow, hoursAhead, correction);
      }
      if (confidenceHigh != null) {
        confidenceHigh = applyForecastCorrection(confidenceHigh, hoursAhead, correction);
      }
    }
    return {
      ...d,
      ts,
      cehqForecast,
      confidenceLow,
      confidenceHigh,
      cehqRange:
        confidenceLow != null && confidenceHigh != null
          ? [confidenceLow, confidenceHigh]
          : undefined,
    };
  });

  // Compute tight Y bounds from the (possibly corrected) flow data.
  const flowValues = chartData.flatMap((d) =>
    [d.observed, d.predicted, d.confidenceLow, d.confidenceHigh, d.cehqForecast].filter(
      (v): v is number => v !== null && v !== undefined,
    ),
  );
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

  // Zoom/pan window (indices into chartData).
  const lastIndex = Math.max(0, chartData.length - 1);
  const [range, setRange] = useState<[number, number]>([0, lastIndex]);

  // Reset when the data length changes (e.g., after a refresh).
  useEffect(() => {
    setRange([0, lastIndex]);
  }, [lastIndex]);

  const safeStart = Math.min(range[0], lastIndex);
  const safeEnd = Math.min(Math.max(range[1], safeStart), lastIndex);
  const visibleTsMin = chartData[safeStart]?.ts ?? tsMin;
  const visibleTsMax = chartData[safeEnd]?.ts ?? tsMax;
  const visibleTicks = ticks.filter((t) => t >= visibleTsMin && t <= visibleTsMax);

  const span = Math.max(1, safeEnd - safeStart);
  const isZoomed = safeStart > 0 || safeEnd < lastIndex;

  function zoomBy(factor: number) {
    if (lastIndex <= 1) return;
    const newSpan = Math.min(lastIndex, Math.max(2, Math.round(span * factor)));
    const center = Math.round((safeStart + safeEnd) / 2);
    let newStart = Math.max(0, center - Math.round(newSpan / 2));
    let newEnd = newStart + newSpan;
    if (newEnd > lastIndex) {
      newEnd = lastIndex;
      newStart = Math.max(0, newEnd - newSpan);
    }
    setRange([newStart, newEnd]);
  }

  function panBy(direction: 1 | -1) {
    if (!isZoomed) return;
    const shift = Math.max(1, Math.round(span * 0.4));
    let newStart = safeStart + direction * shift;
    let newEnd = safeEnd + direction * shift;
    if (newStart < 0) {
      newStart = 0;
      newEnd = span;
    }
    if (newEnd > lastIndex) {
      newEnd = lastIndex;
      newStart = Math.max(0, lastIndex - span);
    }
    setRange([newStart, newEnd]);
  }

  function resetZoom() {
    setRange([0, lastIndex]);
  }

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

      {/* Zoom/pan controls — tap-friendly on touch devices */}
      <div className="mb-2 flex items-center gap-1 text-zinc-600 dark:text-zinc-300">
        <button
          type="button"
          onClick={() => zoomBy(0.5)}
          aria-label={t("chart.zoomIn")}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 bg-white text-base font-semibold hover:bg-zinc-50 active:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:active:bg-zinc-600"
          disabled={span <= 2}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomBy(2)}
          aria-label={t("chart.zoomOut")}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 bg-white text-base font-semibold hover:bg-zinc-50 active:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:active:bg-zinc-600"
          disabled={!isZoomed}
        >
          −
        </button>
        <div className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-700" />
        <button
          type="button"
          onClick={() => panBy(-1)}
          aria-label={t("chart.panLeft")}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 bg-white text-base hover:bg-zinc-50 active:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:active:bg-zinc-600"
          disabled={!isZoomed || safeStart <= 0}
        >
          ←
        </button>
        <button
          type="button"
          onClick={() => panBy(1)}
          aria-label={t("chart.panRight")}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 bg-white text-base hover:bg-zinc-50 active:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:active:bg-zinc-600"
          disabled={!isZoomed || safeEnd >= lastIndex}
        >
          →
        </button>
        {isZoomed && (
          <button
            type="button"
            onClick={resetZoom}
            className="ml-auto flex h-9 items-center justify-center rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium hover:bg-zinc-50 active:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:active:bg-zinc-600"
          >
            {t("chart.resetZoom")}
          </button>
        )}
      </div>

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
            domain={[visibleTsMin, visibleTsMax]}
            ticks={visibleTicks}
            allowDataOverflow
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
            allowEscapeViewBox={{ x: false, y: true }}
            wrapperStyle={{ pointerEvents: "none" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload as
                | (HourlyChartPoint & { ts: number })
                | undefined;
              if (!d) return null;
              return (
                <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-800 pointer-coarse:-translate-y-[calc(100%_+_2.5rem)]">
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

          {/* CEHQ official forecast (bias-corrected in place when a correction is active) */}
          <Line
            dataKey="cehqForecast"
            stroke="#a855f7"
            strokeWidth={2}
            strokeDasharray="4 2"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
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
