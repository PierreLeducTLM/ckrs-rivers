import type { WeatherWindow } from "@/lib/domain/weather-window";
import type { RiverStation } from "@/lib/domain/river-station";
import type { FlowReading } from "@/lib/domain/flow-reading";
import type { OfficialForecast } from "@/lib/domain/official-forecast";
import type { FeatureRow, FeatureComputeContext, ComputeMode } from "./types";
import { precipitationFeatures } from "./precipitation";
import { snowmeltFeatures } from "./snowmelt";
import { soilFeatures } from "./soil";
import { temperatureFeatures } from "./temperature";
import { seasonalFeatures } from "./seasonal";
import { catchmentFeatures } from "./catchment";
import { lagFeatures } from "./lag";
import { officialForecastFeatures } from "./official-forecast";

// ---------------------------------------------------------------------------
// Single row computation
// ---------------------------------------------------------------------------

export function computeFeatureRow(ctx: FeatureComputeContext): FeatureRow {
  return {
    _stationId: ctx.station.id,
    _date: ctx.targetDate,
    ...precipitationFeatures(ctx),
    ...snowmeltFeatures(ctx),
    ...soilFeatures(ctx),
    ...temperatureFeatures(ctx),
    ...seasonalFeatures(ctx),
    ...catchmentFeatures(ctx),
    ...lagFeatures(ctx),
    ...officialForecastFeatures(ctx),
  };
}

// ---------------------------------------------------------------------------
// Matrix computation — feature rows for a date range
// ---------------------------------------------------------------------------

function eachDate(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start + "T00:00:00Z");
  const last = new Date(end + "T00:00:00Z");
  while (current <= last) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function buildFlowByDate(readings?: FlowReading[]): Map<string, number> {
  const map = new Map<string, number>();
  if (!readings) return map;

  const sums = new Map<string, { total: number; count: number }>();
  for (const r of readings) {
    if (r.flow === undefined) continue;
    const date = r.timestamp.slice(0, 10);
    const entry = sums.get(date) ?? { total: 0, count: 0 };
    entry.total += r.flow as number;
    entry.count += 1;
    sums.set(date, entry);
  }

  for (const [date, { total, count }] of sums) {
    map.set(date, total / count);
  }
  return map;
}

function buildForecastByDate(
  forecasts?: OfficialForecast[],
): Map<string, OfficialForecast> {
  const map = new Map<string, OfficialForecast>();
  if (!forecasts) return map;

  for (const f of forecasts) {
    const existing = map.get(f.targetDate);
    // Keep the forecast with the smallest horizon (most reliable)
    if (!existing || (f.horizonDays as number) < (existing.horizonDays as number)) {
      map.set(f.targetDate, f);
    }
  }
  return map;
}

export function computeFeatureMatrix(params: {
  station: RiverStation;
  weatherTimeline: WeatherWindow[];
  flowReadings?: FlowReading[];
  forecasts?: OfficialForecast[];
  forecastBias?: number | null;
  historicalWeatherForPercentiles?: WeatherWindow[] | null;
  mode: ComputeMode;
  startDate: string;
  endDate: string;
}): FeatureRow[] {
  const {
    station,
    weatherTimeline,
    flowReadings,
    forecasts,
    forecastBias = null,
    historicalWeatherForPercentiles = null,
    mode,
    startDate,
    endDate,
  } = params;

  const flowByDate = buildFlowByDate(flowReadings);
  const forecastByDate = buildForecastByDate(forecasts);
  const dates = eachDate(startDate, endDate);

  const rows: FeatureRow[] = [];

  for (const date of dates) {
    const ctx: FeatureComputeContext = {
      targetDate: date,
      station,
      weatherBuffer: weatherTimeline,
      flowByDate,
      forecast: forecastByDate.get(date) ?? null,
      forecastBias,
      historicalWeatherForPercentiles,
      mode,
    };

    rows.push(computeFeatureRow(ctx));
  }

  return rows;
}
