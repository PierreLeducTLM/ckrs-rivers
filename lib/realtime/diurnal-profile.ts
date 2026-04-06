/**
 * Computes a diurnal (24-hour) flow profile from CEHQ 15-minute readings.
 *
 * The profile captures the typical hourly shape of the river's flow:
 * e.g., spring melt rivers peak in late afternoon (warm = melt) and
 * drop overnight (cold = refreeze).
 *
 * The profile is a set of 24 scaling factors (one per hour) that sum to 24.
 * A factor of 1.0 = that hour has average flow.
 * A factor of 1.3 = that hour is typically 30% above average.
 */

import type { RealtimeReading } from "./cehq-client";

export interface DiurnalProfile {
  /** 24 scaling factors indexed by hour (0-23). Sum ≈ 24. */
  hourlyFactors: number[];
  /** Number of complete days used to compute the profile. */
  daysUsed: number;
  /** Average daily flow across the period (m³/s). */
  averageDailyFlow: number;
}

/**
 * Compute a diurnal profile from 15-minute readings.
 * Groups readings by hour, computes the mean flow for each hour,
 * then normalizes so the factors represent deviation from the daily mean.
 */
export function computeDiurnalProfile(
  readings: RealtimeReading[],
): DiurnalProfile | null {
  if (readings.length < 48) return null; // Need at least 2 days

  // Group by hour → collect all flow values for that hour
  const hourlyFlows: number[][] = Array.from({ length: 24 }, () => []);

  for (const r of readings) {
    if (r.flow === null) continue;
    const hour = parseInt(r.time.slice(0, 2), 10);
    hourlyFlows[hour].push(r.flow);
  }

  // Compute mean flow per hour
  const hourlyMeans = hourlyFlows.map((flows) => {
    if (flows.length === 0) return null;
    return flows.reduce((s, f) => s + f, 0) / flows.length;
  });

  // Overall mean (across all hours)
  const allMeans = hourlyMeans.filter((m): m is number => m !== null);
  if (allMeans.length < 12) return null; // Need at least half the hours

  const overallMean = allMeans.reduce((s, m) => s + m, 0) / allMeans.length;
  if (overallMean <= 0) return null;

  // Scaling factors: hourlyMean / overallMean
  // Missing hours get factor 1.0 (assume average)
  const hourlyFactors = hourlyMeans.map((mean) =>
    mean !== null ? mean / overallMean : 1.0,
  );

  // Count complete days
  const dates = new Set(readings.map((r) => r.date));

  return {
    hourlyFactors,
    daysUsed: dates.size,
    averageDailyFlow: overallMean,
  };
}

/**
 * Apply a diurnal profile to expand daily forecasts into hourly forecasts.
 *
 * For each forecast day, produces 24 hourly values scaled by the diurnal pattern.
 * Confidence bands are also scaled proportionally.
 */
export interface HourlyForecastPoint {
  date: string;
  hour: number;
  timestamp: string; // ISO datetime
  flow: number;
  flowLow: number;
  flowHigh: number;
  isObserved: boolean;
}

export function expandToHourly(
  dailyForecasts: {
    date: string;
    flow: number;
    flowLow: number;
    flowHigh: number;
  }[],
  profile: DiurnalProfile,
): HourlyForecastPoint[] {
  const points: HourlyForecastPoint[] = [];
  const n = dailyForecasts.length;
  if (n === 0) return points;

  for (let d = 0; d < n; d++) {
    const day = dailyForecasts[d];
    const prevFlow = d > 0 ? dailyForecasts[d - 1].flow : day.flow;
    const prevLow = d > 0 ? dailyForecasts[d - 1].flowLow : day.flowLow;
    const prevHigh = d > 0 ? dailyForecasts[d - 1].flowHigh : day.flowHigh;
    const nextFlow = d < n - 1 ? dailyForecasts[d + 1].flow : day.flow;
    const nextLow = d < n - 1 ? dailyForecasts[d + 1].flowLow : day.flowLow;
    const nextHigh = d < n - 1 ? dailyForecasts[d + 1].flowHigh : day.flowHigh;

    for (let hour = 0; hour < 24; hour++) {
      // Dampen diurnal variation: river flow changes slowly, so keep only
      // ~15% of the raw hourly deviation from the daily mean.
      const rawFactor = profile.hourlyFactors[hour];
      const dampening = 0.15;
      const factor = 1.0 + (rawFactor - 1.0) * dampening;

      // Smoothly interpolate the base flow across days:
      // First half of day blends from previous day, second half blends toward next day
      let t: number;
      let baseFlow: number, baseLow: number, baseHigh: number;

      if (hour < 12) {
        // Blend from previous day's value toward today
        t = (hour + 12) / 24; // 0.5 at hour 0, 1.0 at hour 12
        baseFlow = prevFlow + (day.flow - prevFlow) * t;
        baseLow = prevLow + (day.flowLow - prevLow) * t;
        baseHigh = prevHigh + (day.flowHigh - prevHigh) * t;
      } else {
        // Blend from today toward next day's value
        t = (hour - 12) / 24; // 0.0 at hour 12, 0.5 at hour 24
        baseFlow = day.flow + (nextFlow - day.flow) * t;
        baseLow = day.flowLow + (nextLow - day.flowLow) * t;
        baseHigh = day.flowHigh + (nextHigh - day.flowHigh) * t;
      }

      points.push({
        date: day.date,
        hour,
        timestamp: `${day.date}T${String(hour).padStart(2, "0")}:00:00Z`,
        flow: baseFlow * factor,
        flowLow: baseLow * factor,
        flowHigh: baseHigh * factor,
        isObserved: false,
      });
    }
  }

  // Smooth with a 3-point weighted average to eliminate step discontinuities
  // at hour boundaries (especially midnight where diurnal factors can jump).
  if (points.length <= 2) return points;

  const smoothed: HourlyForecastPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    smoothed.push({
      ...points[i],
      flow: points[i - 1].flow * 0.25 + points[i].flow * 0.5 + points[i + 1].flow * 0.25,
      flowLow: points[i - 1].flowLow * 0.25 + points[i].flowLow * 0.5 + points[i + 1].flowLow * 0.25,
      flowHigh: points[i - 1].flowHigh * 0.25 + points[i].flowHigh * 0.5 + points[i + 1].flowHigh * 0.25,
    });
  }
  smoothed.push(points[points.length - 1]);

  return smoothed;
}

/**
 * Build hourly observed points from CEHQ readings (aggregated to hourly).
 */
export function observedToHourly(
  readings: RealtimeReading[],
): HourlyForecastPoint[] {
  // Group by date+hour → average flow
  const byHour = new Map<string, { sum: number; count: number }>();

  for (const r of readings) {
    if (r.flow === null) continue;
    const hour = parseInt(r.time.slice(0, 2), 10);
    const key = `${r.date}T${String(hour).padStart(2, "0")}`;
    const entry = byHour.get(key) ?? { sum: 0, count: 0 };
    entry.sum += r.flow;
    entry.count += 1;
    byHour.set(key, entry);
  }

  const points: HourlyForecastPoint[] = [];
  for (const [key, { sum, count }] of byHour) {
    const [date, hourStr] = key.split("T");
    const hour = parseInt(hourStr, 10);
    const flow = sum / count;
    points.push({
      date,
      hour,
      timestamp: `${key}:00:00Z`,
      flow,
      flowLow: flow,
      flowHigh: flow,
      isObserved: true,
    });
  }

  return points.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
