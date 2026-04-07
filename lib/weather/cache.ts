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

/** Sanitize a coordinate value for use in a cache key. */
function sanitizeCoord(value: number): string {
  const rounded = Math.abs(value).toFixed(2);
  return value < 0 ? `n${rounded}` : rounded;
}

/**
 * Build a deterministic cache key from query parameters.
 */
export function getCacheKey(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
): string {
  return `${sanitizeCoord(lat)}_${sanitizeCoord(lon)}_${startDate}_${endDate}.json`;
}

/** Iterate every calendar date between `start` and `end` (inclusive). */
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
// Redis backend (Upstash — used on Vercel and local with env vars)
// ---------------------------------------------------------------------------

const KV_PREFIX = "weather:";
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

type RedisClient = import("@upstash/redis").Redis;

let _redis: RedisClient | null | undefined;

function getRedis(): RedisClient | null {
  if (_redis !== undefined) return _redis;

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    _redis = null;
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require("@upstash/redis") as typeof import("@upstash/redis");
    _redis = Redis.fromEnv();
    return _redis;
  } catch {
    _redis = null;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read a cached entry. Returns `null` on miss or if Redis is not configured.
 */
export async function readCache(key: string): Promise<WeatherWindow[] | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const data = await redis.get<WeatherWindow[]>(`${KV_PREFIX}${key}`);
    if (!data) return null;
    return z.array(WeatherWindowSchema).parse(data);
  } catch {
    return null;
  }
}

/**
 * Persist weather windows to cache. Non-fatal on failure.
 */
export async function writeCache(
  key: string,
  windows: WeatherWindow[],
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(`${KV_PREFIX}${key}`, windows, { ex: CACHE_TTL_SECONDS });
  } catch {
    // Cache write failure is non-fatal
  }
}

/**
 * Scan the cache for data that overlaps the requested coordinate + date range.
 *
 * Returns:
 * - `cached`  — WeatherWindow objects already stored for the region.
 * - `missingRanges` — consecutive date spans that still need to be fetched.
 */
export async function findCachedRange(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
): Promise<{ cached: WeatherWindow[]; missingRanges: DateRange[] }> {
  const prefix = `${sanitizeCoord(lat)}_${sanitizeCoord(lon)}_`;

  const redis = getRedis();
  if (!redis) {
    return { cached: [], missingRanges: [{ startDate, endDate }] };
  }

  let keys: string[];
  try {
    const raw = await redis.keys(`${KV_PREFIX}${prefix}*`);
    keys = raw.map((k) => String(k).slice(KV_PREFIX.length));
  } catch {
    return { cached: [], missingRanges: [{ startDate, endDate }] };
  }

  const allWindows: WeatherWindow[] = [];

  for (const key of keys) {
    const windows = await readCache(key);
    if (windows) allWindows.push(...windows);
  }

  // Keep only the windows inside the requested range
  const cached = allWindows.filter(
    (w) => w.date >= startDate && w.date <= endDate,
  );

  // Determine which dates are still missing
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
      const prev = new Date(`${date}T00:00:00`);
      prev.setDate(prev.getDate() - 1);
      missingRanges.push({
        startDate: rangeStart,
        endDate: prev.toISOString().slice(0, 10),
      });
      rangeStart = null;
    }
  }

  if (rangeStart !== null) {
    missingRanges.push({ startDate: rangeStart, endDate });
  }

  return { cached, missingRanges };
}
