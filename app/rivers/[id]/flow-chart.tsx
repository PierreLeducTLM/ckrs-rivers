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

export interface ChartDataPoint {
  date: string;
  label: string;
  observed: number | null;
  predicted: number | null;
  confidenceLow: number | null;
  confidenceHigh: number | null;
}

interface FlowChartProps {
  data: ChartDataPoint[];
  todayDate: string;
}

export default function FlowChart({ data, todayDate }: FlowChartProps) {
  // Find max flow for Y axis
  const maxFlow = Math.max(
    ...data.map((d) =>
      Math.max(d.observed ?? 0, d.confidenceHigh ?? d.predicted ?? 0),
    ),
  );
  const yMax = Math.ceil(maxFlow * 1.15);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Flow Forecast
      </h2>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="confidenceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            opacity={0.1}
          />

          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }}
            tickLine={false}
            axisLine={{ stroke: "currentColor", opacity: 0.15 }}
          />

          <YAxis
            domain={[0, yMax]}
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }}
            tickLine={false}
            axisLine={{ stroke: "currentColor", opacity: 0.15 }}
            label={{
              value: "m³/s",
              angle: -90,
              position: "insideLeft",
              offset: 10,
              style: { fontSize: 11, fill: "currentColor", opacity: 0.5 },
            }}
          />

          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    {label}
                  </p>
                  {payload.map((entry) => {
                    if (
                      entry.dataKey === "confidenceRange" ||
                      entry.value == null
                    )
                      return null;
                    const isObserved = entry.dataKey === "observed";
                    return (
                      <p
                        key={entry.dataKey as string}
                        style={{ color: entry.color }}
                        className="mt-0.5"
                      >
                        {isObserved ? "Observed" : "Predicted"}:{" "}
                        <span className="font-semibold">
                          {Number(entry.value).toFixed(1)} m³/s
                        </span>
                      </p>
                    );
                  })}
                  {payload.find((p) => p.dataKey === "confidenceRange") && (
                    <p className="mt-0.5 text-zinc-500 dark:text-zinc-400">
                      Range:{" "}
                      {(() => {
                        const d = data.find((d) => d.label === label);
                        if (!d?.confidenceLow || !d?.confidenceHigh)
                          return "—";
                        return `${d.confidenceLow.toFixed(1)} – ${d.confidenceHigh.toFixed(1)} m³/s`;
                      })()}
                    </p>
                  )}
                </div>
              );
            }}
          />

          {/* Today reference line */}
          <ReferenceLine
            x={data.find((d) => d.date === todayDate)?.label}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{
              value: "Today",
              position: "top",
              fill: "#f59e0b",
              fontSize: 11,
            }}
          />

          {/* Confidence band (area between low and high) */}
          <Area
            dataKey="confidenceRange"
            fill="url(#confidenceFill)"
            stroke="none"
            isAnimationActive={false}
          />

          {/* Observed flow — solid blue line */}
          <Line
            dataKey="observed"
            stroke="#2563eb"
            strokeWidth={2.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />

          {/* Predicted flow — dashed line */}
          <Line
            dataKey="predicted"
            stroke="#f97316"
            strokeWidth={3}
            strokeDasharray="8 4"
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 rounded bg-blue-600" />
          Observed
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="20" height="3" className="text-orange-500">
            <line x1="0" y1="1.5" x2="20" y2="1.5" stroke="currentColor" strokeWidth="3" strokeDasharray="5 3" />
          </svg>
          Predicted
          {data.find((d) => d.predicted !== null) && (
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {data
                .filter((d) => d.predicted !== null)
                .map((d) => `${d.label}: ${d.predicted!.toFixed(1)}`)
                .join(", ")}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded bg-blue-500/20" />
          Confidence interval
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="20" height="2" className="text-amber-500">
            <line x1="0" y1="1" x2="20" y2="1" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
          </svg>
          Today
        </span>
      </div>
    </div>
  );
}
