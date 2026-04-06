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
} from "recharts";

export interface HistoryChartPoint {
  date: string;
  label: string;
  observed: number | null;
  predicted: number | null;
  predictedLow: number | null;
  predictedHigh: number | null;
  confidenceRange?: [number, number];
}

interface HistoryChartProps {
  data: HistoryChartPoint[];
}

export default function HistoryChart({ data }: HistoryChartProps) {
  if (data.length === 0) return null;

  const maxFlow = Math.max(
    ...data.map((d) =>
      Math.max(d.observed ?? 0, d.predictedHigh ?? d.predicted ?? 0),
    ),
  );
  const yMax = Math.ceil(maxFlow * 1.15);

  // Show ~8-10 ticks spread evenly
  const step = Math.max(1, Math.floor(data.length / 8));
  const ticks = data.filter((_, i) => i % step === 0).map((d) => d.label);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="histConfFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#f97316" stopOpacity={0.03} />
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
            domain={[0, yMax]}
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
              const d = payload[0]?.payload as HistoryChartPoint | undefined;
              if (!d) return null;
              return (
                <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    {new Date(d.date + "T00:00:00Z").toLocaleDateString(
                      "en-CA",
                      {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC",
                      },
                    )}
                  </p>
                  {d.observed !== null && (
                    <p className="mt-0.5 text-blue-600">
                      Observed:{" "}
                      <span className="font-semibold">
                        {d.observed.toFixed(1)} m&sup3;/s
                      </span>
                    </p>
                  )}
                  {d.predicted !== null && (
                    <p className="mt-0.5 text-orange-500">
                      Model:{" "}
                      <span className="font-semibold">
                        {d.predicted.toFixed(1)} m&sup3;/s
                      </span>
                    </p>
                  )}
                  {d.observed !== null && d.predicted !== null && (
                    <p className="mt-0.5 text-zinc-500">
                      Error:{" "}
                      <span
                        className={
                          Math.abs(d.observed - d.predicted) / d.observed < 0.1
                            ? "font-semibold text-emerald-500"
                            : Math.abs(d.observed - d.predicted) / d.observed <
                                0.25
                              ? "font-semibold text-amber-500"
                              : "font-semibold text-red-500"
                        }
                      >
                        {((Math.abs(d.observed - d.predicted) / d.observed) * 100).toFixed(1)}%
                      </span>
                    </p>
                  )}
                </div>
              );
            }}
          />

          {/* Confidence band around predictions */}
          <Area
            dataKey="confidenceRange"
            fill="url(#histConfFill)"
            stroke="none"
            isAnimationActive={false}
          />

          {/* Observed flow — solid blue */}
          <Line
            dataKey="observed"
            stroke="#2563eb"
            strokeWidth={2.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />

          {/* Model prediction — dashed orange */}
          <Line
            dataKey="predicted"
            stroke="#f97316"
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 rounded bg-blue-600" />
          Observed
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="20" height="3" className="text-orange-500">
            <line
              x1="0"
              y1="1.5"
              x2="20"
              y2="1.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="5 3"
            />
          </svg>
          Model estimate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded bg-orange-500/15" />
          Confidence band
        </span>
      </div>
    </div>
  );
}
