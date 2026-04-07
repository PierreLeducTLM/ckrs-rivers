"use client";

import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, YAxis } from "recharts";

interface SparklinePoint {
  ts: number;
  observed: number | null;
  cehqForecast: number | null;
  cehqRange?: [number, number];
}

interface SparklineChartProps {
  data: SparklinePoint[];
  nowTs: number;
  paddling?: { min?: number; ideal?: number; max?: number } | null;
}

export default function SparklineChart({ data, nowTs, paddling }: SparklineChartProps) {
  if (data.length < 2) return null;

  const allValues = data.flatMap((d) => {
    const vals: number[] = [];
    if (d.observed != null) vals.push(d.observed);
    if (d.cehqForecast != null) vals.push(d.cehqForecast);
    if (d.cehqRange) vals.push(d.cehqRange[0], d.cehqRange[1]);
    return vals;
  });
  if (paddling?.min != null) allValues.push(paddling.min);
  if (allValues.length === 0) return null;

  const yMin = Math.max(0, Math.min(...allValues) * 0.9);
  const yMax = Math.max(...allValues) * 1.1;

  return (
    <ResponsiveContainer width="100%" height={60}>
      <ComposedChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }} style={{ pointerEvents: "none" }}>
        <defs>
          <linearGradient id="sparkConf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#a855f7" stopOpacity={0.05} />
          </linearGradient>
        </defs>

        <YAxis domain={[yMin, yMax]} hide />

        <ReferenceLine x={nowTs} stroke="#f59e0b" strokeDasharray="2 2" strokeWidth={1} />

        {paddling?.min != null && (
          <ReferenceLine y={paddling.min} stroke="#eab308" strokeDasharray="3 3" strokeWidth={1} strokeOpacity={0.6} />
        )}

        <Area
          dataKey="cehqRange"
          fill="url(#sparkConf)"
          stroke="none"
          isAnimationActive={false}
        />

        <Line
          dataKey="observed"
          stroke="#2563eb"
          strokeWidth={1.5}
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
        />

        <Line
          dataKey="cehqForecast"
          stroke="#a855f7"
          strokeWidth={1.5}
          strokeDasharray="3 2"
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
