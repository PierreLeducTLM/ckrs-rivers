import type { WeatherWindow } from "@/lib/domain/weather-window";

/**
 * Cast a branded number to plain number.
 * Zod brands are phantom types — this is a no-op at runtime.
 */
export function n(value: number): number {
  return value;
}

/**
 * Find the index of `targetDate` within a sorted WeatherWindow buffer.
 * Returns -1 if not found.
 */
export function findDateIndex(
  buffer: WeatherWindow[],
  targetDate: string,
): number {
  let lo = 0;
  let hi = buffer.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cmp = buffer[mid].date.localeCompare(targetDate);
    if (cmp === 0) return mid;
    if (cmp < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/**
 * Get the last `days` WeatherWindows ending at `targetIndex` (inclusive).
 */
export function lookback(
  buffer: WeatherWindow[],
  targetIndex: number,
  days: number,
): WeatherWindow[] {
  const start = Math.max(0, targetIndex - days + 1);
  return buffer.slice(start, targetIndex + 1);
}

/**
 * Rolling sum of a numeric accessor over the last N days.
 */
export function rollingSum(
  buffer: WeatherWindow[],
  targetIndex: number,
  days: number,
  accessor: (w: WeatherWindow) => number,
): number | null {
  const window = lookback(buffer, targetIndex, days);
  if (window.length === 0) return null;
  return window.reduce((sum, w) => sum + accessor(w), 0);
}

/**
 * Parse an ISO date string into day-of-year (1–366).
 */
export function dayOfYear(isoDate: string): number {
  const d = new Date(isoDate + "T00:00:00Z");
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000) + 1;
}

/**
 * Subtract N days from an ISO date string.
 */
export function subtractDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Simple linear regression slope. Returns null if fewer than 2 valid points.
 */
export function linearSlope(values: (number | null)[]): number | null {
  const valid: { x: number; y: number }[] = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== null) valid.push({ x: i, y: values[i] as number });
  }
  if (valid.length < 2) return null;
  const nn = valid.length;
  const sumX = valid.reduce((s, p) => s + p.x, 0);
  const sumY = valid.reduce((s, p) => s + p.y, 0);
  const sumXY = valid.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = valid.reduce((s, p) => s + p.x * p.x, 0);
  const denom = nn * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (nn * sumXY - sumX * sumY) / denom;
}
