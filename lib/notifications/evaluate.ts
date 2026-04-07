/**
 * Alert evaluation engine.
 *
 * Computes a StationSnapshot from current forecast data and compares
 * it against the previous snapshot to produce AlertCandidates.
 */

import type { PaddlingLevels } from "@/lib/data/rivers";
import {
  ALERT_PRIORITY,
  type AlertCandidate,
  type AlertType,
  type ConfidenceLevel,
  type PaddlingStatus,
  type StationSnapshot,
  type TrendDirection,
} from "@/lib/domain/notification";
import { getPaddlingStatus, isGoodRange } from "@/lib/notifications/paddling-status";

// ---------------------------------------------------------------------------
// Forecast data shapes (from forecast_cache JSON columns)
// ---------------------------------------------------------------------------

export interface ForecastDay {
  date: string;
  flow: number;
  flowLow?: number;
  flowHigh?: number;
}

export interface HourlyPoint {
  timestamp: string;
  observed: number | null;
  cehqForecast: number | null;
}

export interface WeatherDay {
  date: string;
  precipitation?: number;
  snowfall?: number;
  snowDepth?: number;
}

export interface StationForecastData {
  stationId: string;
  stationName: string;
  lastFlow: { date: string; flow: number } | null;
  forecastDays: ForecastDay[];
  hourlyData: HourlyPoint[];
  weatherDays: WeatherDay[];
}

// ---------------------------------------------------------------------------
// Snapshot computation
// ---------------------------------------------------------------------------

export function computeSnapshot(
  data: StationForecastData,
  paddling: PaddlingLevels | undefined,
  now: Date,
): StationSnapshot {
  const currentFlow = data.lastFlow?.flow ?? null;
  const { status: paddlingStatus } = getPaddlingStatus(currentFlow, paddling);

  // Count consecutive runnable forecast days
  const runnableWindowDays = countRunnableWindow(data.forecastDays, paddling);

  // Compute trend from recent hourly data
  const trendDirection = computeTrend(data.hourlyData);

  // When does the forecast enter runnable range?
  const { enters, entersInDays } = forecastEntersRange(
    data.forecastDays,
    paddling,
    paddlingStatus,
  );

  // When does the forecast exit runnable range?
  const { exits, exitsInHours } = forecastExitsRange(
    data.forecastDays,
    data.hourlyData,
    paddling,
    paddlingStatus,
  );

  // Precipitation next 48 hours
  const precipNext48h = sumPrecipitation(data.weatherDays, now, 2);

  // Confidence level from forecast range width
  const confidenceLevel = computeConfidence(data.forecastDays);

  return {
    stationId: data.stationId,
    currentFlow,
    paddlingStatus,
    runnableWindowDays,
    trendDirection,
    forecastEntersRange: enters,
    forecastEntersRangeInDays: entersInDays,
    forecastExitsRange: exits,
    forecastExitsRangeInHours: exitsInHours,
    precipNext48h,
    confidenceLevel,
    isSeasonFirst: false, // Set by the task after checking alert_state history
    evaluatedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Differential alert detection
// ---------------------------------------------------------------------------

export function detectAlerts(
  current: StationSnapshot,
  previous: StationSnapshot | null,
  stationName: string,
  paddling: PaddlingLevels | undefined,
): AlertCandidate[] {
  const candidates: AlertCandidate[] = [];
  const prev = previous;
  const wasRunnable = prev ? isGoodRange(prev.paddlingStatus) : false;
  const isRunnable = isGoodRange(current.paddlingStatus);

  function add(alertType: AlertType, message: string, context: Record<string, unknown> = {}) {
    candidates.push({
      alertType,
      priority: ALERT_PRIORITY[alertType],
      stationId: current.stationId,
      stationName,
      currentFlow: current.currentFlow,
      message,
      context,
    });
  }

  // --- its-on: entered runnable range ---
  if (isRunnable && !wasRunnable) {
    const flow = current.currentFlow?.toFixed(1) ?? "?";
    add("its-on", `${stationName} is now in runnable range at ${flow} m\u00b3/s. Time to paddle!`);
  }

  // --- safety-warning: entered too-high ---
  if (current.paddlingStatus === "too-high" && prev?.paddlingStatus !== "too-high") {
    const flow = current.currentFlow?.toFixed(1) ?? "?";
    add(
      "safety-warning",
      `${stationName} has exceeded safe levels at ${flow} m\u00b3/s. Exercise extreme caution.`,
    );
  }

  // --- last-call: currently runnable but exiting within 12h ---
  if (isRunnable && current.forecastExitsRange && current.forecastExitsRangeInHours != null && current.forecastExitsRangeInHours <= 12) {
    const hours = Math.round(current.forecastExitsRangeInHours);
    add(
      "last-call",
      `${stationName} is still runnable but expected to leave range in ~${hours} hours. Last chance!`,
      { exitsInHours: hours },
    );
  }

  // --- dropping-out: currently runnable but exiting within 24h ---
  if (isRunnable && current.forecastExitsRange && current.forecastExitsRangeInHours != null && current.forecastExitsRangeInHours > 12 && current.forecastExitsRangeInHours <= 24) {
    const hours = Math.round(current.forecastExitsRangeInHours);
    add(
      "dropping-out",
      `${stationName} is expected to drop out of range in ~${hours} hours.`,
      { exitsInHours: hours },
    );
  }

  // --- runnable-in-n-days: forecast enters range within lead time ---
  if (!isRunnable && current.forecastEntersRange && current.forecastEntersRangeInDays != null) {
    const days = Math.round(current.forecastEntersRangeInDays);
    add(
      "runnable-in-n-days",
      `${stationName} is predicted to become runnable in ${days} day${days === 1 ? "" : "s"}.`,
      { entersInDays: days },
    );
  }

  // --- rain-bump: significant precipitation incoming ---
  if (current.precipNext48h > 15 && (prev == null || prev.precipNext48h <= 15)) {
    add(
      "rain-bump",
      `${current.precipNext48h.toFixed(0)}mm of rain expected in the next 48 hours for ${stationName}. Flow may rise significantly.`,
      { precipMm: current.precipNext48h },
    );
  }

  // --- confidence-upgraded: medium → high ---
  if (current.confidenceLevel === "high" && prev?.confidenceLevel === "medium") {
    add(
      "confidence-upgraded",
      `Forecast confidence for ${stationName} has been upgraded to high. The prediction is now more reliable.`,
    );
  }

  // --- rising-into-range: trending up, approaching min ---
  if (
    current.trendDirection === "rising" &&
    current.paddlingStatus === "too-low" &&
    current.currentFlow != null &&
    paddling?.min != null &&
    current.currentFlow > paddling.min * 0.8
  ) {
    const flow = current.currentFlow.toFixed(1);
    const min = paddling.min.toFixed(1);
    add(
      "rising-into-range",
      `${stationName} is rising (${flow} m\u00b3/s) and approaching runnable range (${min} m\u00b3/s).`,
    );
  }

  // --- window-extended: runnable window grew ---
  if (prev && current.runnableWindowDays > prev.runnableWindowDays && current.runnableWindowDays - prev.runnableWindowDays >= 1) {
    add(
      "window-extended",
      `Good news! The runnable window for ${stationName} has extended to ${current.runnableWindowDays} days.`,
      { windowDays: current.runnableWindowDays },
    );
  }

  // --- window-shortened: runnable window shrank ---
  if (prev && prev.runnableWindowDays > 0 && current.runnableWindowDays < prev.runnableWindowDays) {
    add(
      "window-shortened",
      `The runnable window for ${stationName} has shortened to ${current.runnableWindowDays} day${current.runnableWindowDays === 1 ? "" : "s"}.`,
      { windowDays: current.runnableWindowDays },
    );
  }

  // --- season-opener: checked externally, but we can produce candidate if isSeasonFirst ---
  if (current.isSeasonFirst && isRunnable) {
    add(
      "season-opener",
      `${stationName} is runnable for the first time this season! The wait is over.`,
    );
  }

  // --- river-is-back: checked externally based on last "its-on" timestamp ---
  // This is set by the task layer after checking alert_state, so we skip here.

  return candidates;
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function countRunnableWindow(
  forecastDays: ForecastDay[],
  paddling: PaddlingLevels | undefined,
): number {
  if (!paddling) return 0;
  let count = 0;
  for (const day of forecastDays) {
    const { status } = getPaddlingStatus(day.flow, paddling);
    if (isGoodRange(status)) {
      count++;
    } else if (count > 0) {
      break; // Stop at first non-runnable day after runnable days
    }
  }
  return count;
}

function computeTrend(hourlyData: HourlyPoint[]): TrendDirection {
  // Look at last 6 hours of data
  const recent = hourlyData.slice(-6);
  if (recent.length < 2) return "stable";

  const flows = recent
    .map((p) => p.observed ?? p.cehqForecast)
    .filter((f): f is number => f != null);

  if (flows.length < 2) return "stable";

  const first = flows[0];
  const last = flows[flows.length - 1];
  const change = (last - first) / first;

  if (change > 0.05) return "rising";
  if (change < -0.05) return "falling";
  return "stable";
}

function forecastEntersRange(
  forecastDays: ForecastDay[],
  paddling: PaddlingLevels | undefined,
  currentStatus: PaddlingStatus,
): { enters: boolean; entersInDays: number | null } {
  if (!paddling || isGoodRange(currentStatus)) {
    return { enters: false, entersInDays: null };
  }

  for (let i = 0; i < forecastDays.length; i++) {
    const { status } = getPaddlingStatus(forecastDays[i].flow, paddling);
    if (isGoodRange(status)) {
      return { enters: true, entersInDays: i + 1 };
    }
  }
  return { enters: false, entersInDays: null };
}

function forecastExitsRange(
  forecastDays: ForecastDay[],
  hourlyData: HourlyPoint[],
  paddling: PaddlingLevels | undefined,
  currentStatus: PaddlingStatus,
): { exits: boolean; exitsInHours: number | null } {
  if (!paddling || !isGoodRange(currentStatus)) {
    return { exits: false, exitsInHours: null };
  }

  // Check forecast days — each day is ~24h
  for (let i = 0; i < forecastDays.length; i++) {
    const { status } = getPaddlingStatus(forecastDays[i].flow, paddling);
    if (!isGoodRange(status)) {
      // Estimate hours: the day index * 24
      return { exits: true, exitsInHours: (i + 1) * 24 };
    }
  }

  // Also check hourly forecast data for more precision
  const now = Date.now();
  for (const point of hourlyData) {
    const flow = point.cehqForecast;
    if (flow == null) continue;
    const ts = new Date(point.timestamp).getTime();
    if (ts <= now) continue;

    const { status } = getPaddlingStatus(flow, paddling);
    if (!isGoodRange(status)) {
      const hoursAhead = (ts - now) / (1000 * 60 * 60);
      return { exits: true, exitsInHours: hoursAhead };
    }
  }

  return { exits: false, exitsInHours: null };
}

function sumPrecipitation(weatherDays: WeatherDay[], now: Date, days: number): number {
  const todayStr = now.toISOString().slice(0, 10);
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return weatherDays
    .filter((w) => w.date >= todayStr && w.date <= cutoffStr)
    .reduce((sum, w) => sum + (w.precipitation ?? 0), 0);
}

function computeConfidence(forecastDays: ForecastDay[]): ConfidenceLevel {
  if (forecastDays.length === 0) return "low";

  // Average relative range width across forecast days
  let totalWidth = 0;
  let count = 0;

  for (const day of forecastDays) {
    if (day.flowLow != null && day.flowHigh != null && day.flow > 0) {
      const width = (day.flowHigh - day.flowLow) / day.flow;
      totalWidth += width;
      count++;
    }
  }

  if (count === 0) return "low";
  const avgWidth = totalWidth / count;

  if (avgWidth < 0.3) return "high";
  if (avgWidth < 0.6) return "medium";
  return "low";
}
