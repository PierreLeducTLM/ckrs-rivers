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

export interface HourlyChartPoint {
  timestamp: string;
  label: string;
  observed: number | null;
  predicted: number | null;
  confidenceLow: number | null;
  confidenceHigh: number | null;
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
}

export default function HourlyChart({ data, nowTimestamp, paddling }: HourlyChartProps) {
  // Compute tight Y bounds from actual flow data
  const flowValues = data.flatMap((d) =>
    [d.observed, d.predicted, d.confidenceLow, d.confidenceHigh].filter(
      (v): v is number => v !== null && v !== undefined,
    ),
  );
  const minDataFlow = flowValues.length > 0 ? Math.min(...flowValues) : 0;
  const maxDataFlow = flowValues.length > 0 ? Math.max(...flowValues) : 1;

  // Y range focuses on the data — add ~10% padding above and below
  const dataRange = maxDataFlow - minDataFlow;
  const padding = Math.max(dataRange * 0.1, 0.5);
  const yMin = Math.max(0, Math.floor(minDataFlow - padding));
  const yMax = Math.ceil(maxDataFlow + padding);

  // Classify each threshold: in-range, above, or below
  const thresholds: { value: number; label: string; color: string; inRange: boolean; position: "above" | "below" | "in" }[] = [];
  if (paddling?.min !== undefined) {
    const v = paddling.min;
    thresholds.push({
      value: v, label: `Min ${v}`, color: "#22c55e",
      inRange: v >= yMin && v <= yMax,
      position: v > yMax ? "above" : v < yMin ? "below" : "in",
    });
  }
  if (paddling?.ideal !== undefined) {
    const v = paddling.ideal;
    thresholds.push({
      value: v, label: `Ideal ${v}`, color: "#eab308",
      inRange: v >= yMin && v <= yMax,
      position: v > yMax ? "above" : v < yMin ? "below" : "in",
    });
  }
  if (paddling?.max !== undefined) {
    const v = paddling.max;
    thresholds.push({
      value: v, label: `Max ${v}`, color: "#ef4444",
      inRange: v >= yMin && v <= yMax,
      position: v > yMax ? "above" : v < yMin ? "below" : "in",
    });
  }

  // Show one tick per 12 hours
  const tickIndices = data
    .map((d, i) => ({ i, h: new Date(d.timestamp).getUTCHours() }))
    .filter(({ h }) => h === 0 || h === 12)
    .map(({ i }) => i);

  const ticks = tickIndices.map((i) => data[i].label);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Hourly Flow Forecast
      </h2>
      <p className="mb-4 text-xs text-zinc-400 dark:text-zinc-500">
        Based on diurnal pattern from CEHQ 15-minute readings
      </p>

      {/* Out-of-range threshold markers pinned to top edge */}
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
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="hourlyConfFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.12} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            opacity={0.08}
          />

          <XAxis
            dataKey="label"
            ticks={ticks}
            tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }}
            tickLine={false}
            axisLine={{ stroke: "currentColor", opacity: 0.15 }}
            interval="preserveStartEnd"
          />

          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }}
            tickLine={false}
            axisLine={{ stroke: "currentColor", opacity: 0.15 }}
            label={{
              value: "m\u00B3/s",
              angle: -90,
              position: "insideLeft",
              offset: 10,
              style: { fontSize: 10, fill: "currentColor", opacity: 0.5 },
            }}
          />

          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload as HourlyChartPoint | undefined;
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
                      Observed: <span className="font-semibold">{d.observed.toFixed(1)} m&sup3;/s</span>
                    </p>
                  )}
                  {d.predicted !== null && (
                    <p className="mt-0.5 text-orange-500">
                      Predicted: <span className="font-semibold">{d.predicted.toFixed(1)} m&sup3;/s</span>
                    </p>
                  )}
                  {d.confidenceLow !== null && d.confidenceHigh !== null && d.predicted !== null && (
                    <p className="mt-0.5 text-zinc-500">
                      Range: {d.confidenceLow.toFixed(1)} &ndash; {d.confidenceHigh.toFixed(1)}
                    </p>
                  )}
                </div>
              );
            }}
          />

          {/* Now reference line */}
          <ReferenceLine
            x={data.find((d) => d.timestamp >= nowTimestamp)?.label}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            strokeWidth={1.5}
          />

          {/* Paddling threshold lines — only in-range ones render as chart lines */}
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

          {/* Confidence band */}
          <Area
            dataKey="confidenceRange"
            fill="url(#hourlyConfFill)"
            stroke="#3b82f6"
            strokeOpacity={0.25}
            strokeWidth={1}
            isAnimationActive={false}
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

          {/* Predicted flow */}
          <Line
            dataKey="predicted"
            stroke="#f97316"
            strokeWidth={2.5}
            strokeDasharray="6 3"
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend with all thresholds */}
      {thresholds.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
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
      )}
    </div>
  );
}
