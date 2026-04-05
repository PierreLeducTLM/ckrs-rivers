import { readdir, readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import {
  WeatherWindowSchema,
  type WeatherWindow,
} from "@/lib/domain/weather-window";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DateRange = { startDate: string; endDate: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the absolute path to the on-disk weather cache directory. */
export function getCacheDir(): string {
  return join(process.cwd(), ".data", "weather-cache");
}

/**
 * Sanitize a single coordinate value for use in a filename.
 * Negative values get an `n` prefix instead of a `-` character.
 */
function sanitizeCoord(value: number): string {
  const rounded = Math.abs(value).toFixed(2);
  return value < 0 ? `n${rounded}` : rounded;
}

/**
 * Build a deterministic, filesystem-safe cache key from query parameters.
 *
 * @example getCacheKey(46.5, -74, "2024-01-01", "2024-12-31")
 *          // => "46.50_n74.00_2024-01-01_2024-12-31.json"
 */
export function getCacheKey(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
): string {
  return `${sanitizeCoord(lat)}_${sanitizeCoord(lon)}_${startDate}_${endDate}.json`;
}

/**
 * Iterate every calendar date between `start` and `end` (inclusive).
 * Returns an array of `"YYYY-MM-DD"` strings.
 */
function eachDate(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);

  while (current <= last) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

/**
 * Read and validate a cached file.
 *
 * Returns `null` when the file is missing, contains invalid JSON, or fails
 * schema validation — the caller never needs to handle those cases.
 */
export async function readCache(key: string): Promise<WeatherWindow[] | null> {
  try {
    const raw = await readFile(join(getCacheDir(), key), "utf-8");
    const json: unknown = JSON.parse(raw);
    return z.array(WeatherWindowSchema).parse(json);
  } catch {
    return null;
  }
}

/**
 * Persist weather windows to the file cache.
 *
 * The write is atomic: data is first flushed to a `.tmp` file, then renamed
 * into place so a crash mid-write never leaves a corrupt cache entry.
 */
export async function writeCache(
  key: string,
  windows: WeatherWindow[],
): Promise<void> {
  const dir = getCacheDir();
  await mkdir(dir, { recursive: true });

  const target = join(dir, key);
  const tmp = join(dir, `${key}.tmp`);

  await writeFile(tmp, JSON.stringify(windows, null, 2), "utf-8");
  await rename(tmp, target);
}

// ---------------------------------------------------------------------------
// Smart range lookup
// ---------------------------------------------------------------------------

/**
 * Scan the cache for data that overlaps the requested coordinate + date range.
 *
 * Returns:
 * - `cached`  — all `WeatherWindow` objects already on disk for the region
 *   that fall within `[startDate, endDate]`.
 * - `missingRanges` — consecutive date spans that still need to be fetched.
 */
export async function findCachedRange(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
): Promise<{ cached: WeatherWindow[]; missingRanges: DateRange[] }> {
  const prefix = `${sanitizeCoord(lat)}_${sanitizeCoord(lon)}_`;

  // ---- Collect every cached window for this coordinate ----
  let files: string[];
  try {
    files = (await readdir(getCacheDir())).filter(
      (f) => f.startsWith(prefix) && f.endsWith(".json"),
    );
  } catch {
    // Cache directory does not exist yet — everything is missing.
    return { cached: [], missingRanges: [{ startDate, endDate }] };
  }

  const allWindows: WeatherWindow[] = [];

  for (const file of files) {
    const windows = await readCache(file);
    if (windows) {
      allWindows.push(...windows);
    }
  }

  // ---- Keep only the windows inside the requested range ----
  const cached = allWindows.filter(
    (w) => w.date >= startDate && w.date <= endDate,
  );

  // ---- Determine which dates are still missing ----
  const cachedDates = new Set(cached.map((w) => w.date));
  const requested = eachDate(startDate, endDate);

  const missingRanges: DateRange[] = [];
  let rangeStart: string | null = null;

  for (const date of requested) {
    if (!cachedDates.has(date)) {
      if (rangeStart === null) {
        rangeStart = date;
      }
    } else if (rangeStart !== null) {
      // End the current missing range on the day before this cached date.
      const prev = new Date(`${date}T00:00:00`);
      prev.setDate(prev.getDate() - 1);
      missingRanges.push({
        startDate: rangeStart,
        endDate: prev.toISOString().slice(0, 10),
      });
      rangeStart = null;
    }
  }

  // Close a trailing open range.
  if (rangeStart !== null) {
    missingRanges.push({ startDate: rangeStart, endDate });
  }

  return { cached, missingRanges };
}
