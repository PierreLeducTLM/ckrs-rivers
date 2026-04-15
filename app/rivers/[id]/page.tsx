export const dynamic = "force-dynamic";

import { getStationById, getPaddlingLevels } from "@/lib/data/rivers";
import { sql } from "@/lib/db/client";
import { notFound } from "next/navigation";
import HourlyChart from "./hourly-chart";
import RefreshButton from "./refresh-button";
import RiverHeader from "./river-header";
import PaddlingStatusMessage from "./paddling-status-message";
import BackButton from "./back-button";
import FavoriteButton from "@/app/favorite-button";
import T from "@/app/translated-text";
import { getPaddlingStatus, isGoodRange } from "@/lib/notifications/paddling-status";
import {
  buildForecastCorrection,
  findFirstSustainedBadPoint,
  findFirstSustainedGoodPoint,
} from "@/app/components/utils";
import RiverMapWrapper from "./river-map-wrapper";
import NavigateToPoint from "./navigate-to-point";
import UpdatedAt from "./updated-at";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: string): string {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Approximate path length in km using Haversine */
function pathDistanceKm(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lat1, lon1] = coords[i - 1];
    const [lat2, lon2] = coords[i];
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) ** 2;
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total;
}

// ---------------------------------------------------------------------------
// Types for cached data
// ---------------------------------------------------------------------------

interface CachedForecast {
  lastFlow: { date: string; flow: number } | null;
  forecastDays: Array<{
    date: string;
    flow: number;
    flowLow: number;
    flowHigh: number;
  }>;
}

interface WeatherDay {
  date: string;
  tempMin: number;
  tempMax: number;
  tempMean: number;
  precipitation: number;
  snowfall: number;
  snowDepth: number;
}

interface HourlyPoint {
  timestamp: string;
  label: string;
  observed: number | null;
  cehqForecast: number | null;
  cehqLow: number | null;
  cehqHigh: number | null;
}

// ---------------------------------------------------------------------------
// Section wrapper for consistent visual style
// ---------------------------------------------------------------------------

function Section({
  title,
  titleKey,
  children,
  className,
}: {
  title?: string;
  titleKey?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 ${className ?? ""}`}
    >
      {(title || titleKey) && (
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {titleKey ? <T k={titleKey} /> : title}
        </h2>
      )}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function RiverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const station = await getStationById(id);
  if (!station) notFound();

  const paddling = (await getPaddlingLevels()).get(id);

  // Load everything from cache — no external API calls on page load
  let cached: CachedForecast | null = null;
  let hourlyData: HourlyPoint[] = [];
  let weatherData: WeatherDay[] = [];
  let generatedAt: string | null = null;

  try {
    const cacheRows = await sql(
      `SELECT forecast_json, hourly_json, weather_json, generated_at::text FROM forecast_cache WHERE station_id = $1`,
      [id],
    ) as Array<{
      forecast_json: CachedForecast;
      hourly_json: HourlyPoint[] | null;
      weather_json: WeatherDay[] | null;
      generated_at: string;
    }>;

    if (cacheRows.length > 0) {
      cached = cacheRows[0].forecast_json;
      hourlyData = cacheRows[0].hourly_json ?? [];
      weatherData = cacheRows[0].weather_json ?? [];
      generatedAt = cacheRows[0].generated_at;
    }
  } catch {
    try {
      const cacheRows = await sql(
        `SELECT forecast_json, hourly_json, generated_at::text FROM forecast_cache WHERE station_id = $1`,
        [id],
      ) as Array<{ forecast_json: CachedForecast; hourly_json: HourlyPoint[] | null; generated_at: string }>;
      if (cacheRows.length > 0) {
        cached = cacheRows[0].forecast_json;
        hourlyData = cacheRows[0].hourly_json ?? [];
        generatedAt = cacheRows[0].generated_at;
      }
    } catch {
      // No cache at all
    }
  }

  const lastFlow = cached?.lastFlow ?? null;

  const lastObservedTimestamp = hourlyData
    .filter((p) => p.observed != null)
    .at(-1)?.timestamp ?? null;

  // Compute paddling status
  const currentFlow = lastFlow?.flow ?? null;
  const { status: paddlingStatus } = getPaddlingStatus(currentFlow, paddling);
  let statusInfo: { key: string; param?: number } | null = null;

  // Recent observed-vs-forecast ratio, decayed over 24h. Used both for the
  // "Should be good in X" text and to render a bias-corrected line on the chart.
  const biasHourlyPoints = hourlyData.map((p) => ({
    ts: new Date(p.timestamp).getTime(),
    observed: p.observed ?? null,
    cehqForecast: p.cehqForecast ?? null,
  }));
  const nowTsForBias = Date.now();
  const forecastCorrection = buildForecastCorrection(biasHourlyPoints, nowTsForBias);

  if (paddling && (paddling.min != null || paddling.ideal != null || paddling.max != null)) {
    const paddlingLevels = {
      min: paddling.min,
      ideal: paddling.ideal,
      max: paddling.max,
    };
    const hourlyPoints = biasHourlyPoints;
    const nowTs = nowTsForBias;

    if (paddlingStatus === "ideal") {
      statusInfo = { key: "detail.ideal" };
    } else if (paddlingStatus === "runnable") {
      statusInfo = { key: "detail.goodToGo" };
    } else if (paddlingStatus === "too-low" || paddlingStatus === "too-high") {
      const hit = findFirstSustainedGoodPoint(hourlyPoints, nowTs, paddlingLevels, forecastCorrection);
      if (hit) {
        if (hit.hoursAhead <= 24) {
          statusInfo = { key: "detail.runnableInHours", param: hit.hoursAhead };
        } else {
          statusInfo = {
            key: "detail.runnableInDays",
            param: Math.ceil(hit.hoursAhead / 24),
          };
        }
      } else {
        statusInfo = {
          key: paddlingStatus === "too-low" ? "detail.tooLow" : "detail.tooHigh",
        };
      }
    }

    if (isGoodRange(paddlingStatus)) {
      const hit = findFirstSustainedBadPoint(hourlyPoints, nowTs, paddlingLevels, forecastCorrection);
      if (hit && hit.hoursAhead <= 48) {
        statusInfo = { key: "detail.droppingOutHours", param: hit.hoursAhead };
      }
    }
  }

  // Chart data
  const twoDaysAgo = new Date();
  twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);
  const cutoff = twoDaysAgo.toISOString().slice(0, 10) + "T00:00:00Z";

  const chartData = hourlyData
    .filter((p) => p.timestamp >= cutoff)
    .map((p) => ({
      timestamp: p.timestamp,
      label: p.label,
      observed: p.observed,
      predicted: null,
      confidenceLow: p.cehqLow ?? null,
      confidenceHigh: p.cehqHigh ?? null,
      cehqForecast: p.cehqForecast,
    }));

  const nowTimestamp = new Date().toISOString();

  // Computed metadata
  const riverPath = station.riverPath ?? null;
  const putIn = station.putIn
    ? ([Number(station.putIn.lat), Number(station.putIn.lon)] as [number, number])
    : null;
  const takeOut = station.takeOut
    ? ([Number(station.takeOut.lat), Number(station.takeOut.lon)] as [number, number])
    : null;
  const distanceKm = riverPath && riverPath.length > 1 ? pathDistanceKm(riverPath) : null;
  const rapidClass = (station.rapidClass as string | undefined) ?? null;
  const description = (station.description as string | undefined) ?? null;

  const hasMapContent = (riverPath && riverPath.length > 0) || putIn || takeOut;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back + Favorite */}
        <div className="flex items-center justify-between">
          <BackButton />
          <FavoriteButton stationId={id} />
        </div>

        {/* River header */}
        <header className="mt-6">
          <RiverHeader
            stationId={id}
            initialName={station.name}
            initialPaddling={{
              min: paddling?.min ?? null,
              ideal: paddling?.ideal ?? null,
              max: paddling?.max ?? null,
            }}
            initialWeatherCity={(station.weatherCity as string | undefined) ?? null}
            stationLat={Number(station.coordinates.lat)}
            stationLon={Number(station.coordinates.lon)}
            initialPutIn={putIn}
            initialTakeOut={takeOut}
            initialRiverPath={riverPath}
            catchmentArea={station.catchmentArea as number | undefined}
            initialRapidClass={rapidClass}
            initialDescription={description}
            regime={station.regime ?? null}
          />

          <div className="mt-3 flex items-center gap-3">
            <RefreshButton stationId={id} />
            {generatedAt && (
              <UpdatedAt isoDate={generatedAt} stationId={id} />
            )}
          </div>
        </header>

        {/* ================================================================
            SECTION 1: Flow & Forecast (most useful info first)
            ================================================================ */}

        {/* Last observed flow */}
        {lastFlow && (
          <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              <T k="detail.lastObservedFlow" />
            </h2>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-4xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                {lastFlow.flow.toFixed(1)}
              </span>
              <span className="text-lg text-zinc-500 dark:text-zinc-400">m&sup3;/s</span>
              <span className="ml-auto text-sm text-zinc-400 dark:text-zinc-500">
                {formatDate(lastFlow.date)}
                {lastObservedTimestamp && (
                  <> {new Date(lastObservedTimestamp).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false })}</>
                )}
              </span>
            </div>
            {statusInfo && (
              <div className="mt-3">
                <PaddlingStatusMessage statusKey={statusInfo.key} param={statusInfo.param} />
              </div>
            )}
          </section>
        )}

        {/* Hourly flow chart */}
        {chartData.length > 0 && (
          <section className="mt-6">
            <HourlyChart data={chartData} nowTimestamp={nowTimestamp} paddling={paddling} correction={forecastCorrection} />
          </section>
        )}

        {/* No data state */}
        {!cached && (
          <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              <T k="detail.noDataYet" />
            </p>
          </section>
        )}

        {/* ================================================================
            SECTION 2: Overview (Map + Quick Info)
            ================================================================ */}
        {(hasMapContent || rapidClass || distanceKm || description) && (
          <div className="mt-8 space-y-4">
            {/* River closeup map */}
            {hasMapContent && (
              <Section titleKey="detail.riverMap">
                <RiverMapWrapper
                  riverPath={riverPath}
                  putIn={putIn}
                  takeOut={takeOut}
                  stationLat={Number(station.coordinates.lat)}
                  stationLon={Number(station.coordinates.lon)}
                />

                {/* Quick stats bar under map */}
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  {rapidClass && (
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 dark:text-zinc-400">
                        <T k="detail.rapidClass" />
                      </span>
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-bold text-white dark:bg-zinc-200 dark:text-zinc-900">
                        {rapidClass}
                      </span>
                    </div>
                  )}
                  {distanceKm != null && (
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 dark:text-zinc-400">
                        <T k="detail.distance" />
                      </span>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {distanceKm < 1
                          ? `${(distanceKm * 1000).toFixed(0)} m`
                          : `${distanceKm.toFixed(1)} km`}
                      </span>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Description */}
            {description && (
              <Section titleKey="detail.description">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {description}
                </p>
              </Section>
            )}

            {/* Put-in / Take-out */}
            {(putIn || takeOut) && (
              <Section titleKey="detail.putInTakeOut">
                <div className="grid gap-4 sm:grid-cols-2">
                  {putIn && (
                    <NavigateToPoint
                      lat={putIn[0]}
                      lon={putIn[1]}
                      label="Put-in"
                      className="cursor-pointer rounded-lg border border-green-200 bg-green-50/50 p-4 text-left transition-colors hover:bg-green-100/60 active:bg-green-100 dark:border-green-900 dark:bg-green-950/30 dark:hover:bg-green-950/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white">
                          P
                        </span>
                        <h3 className="text-sm font-semibold text-green-800 dark:text-green-300">
                          <T k="detail.putIn" />
                        </h3>
                        <svg className="ml-auto h-4 w-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                      </div>
                      <p className="mt-2 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                        {putIn[0].toFixed(5)}, {putIn[1].toFixed(5)}
                      </p>
                    </NavigateToPoint>
                  )}
                  {takeOut && (
                    <NavigateToPoint
                      lat={takeOut[0]}
                      lon={takeOut[1]}
                      label="Take-out"
                      className="cursor-pointer rounded-lg border border-red-200 bg-red-50/50 p-4 text-left transition-colors hover:bg-red-100/60 active:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:hover:bg-red-950/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
                          T
                        </span>
                        <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">
                          <T k="detail.takeOut" />
                        </h3>
                        <svg className="ml-auto h-4 w-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                      </div>
                      <p className="mt-2 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                        {takeOut[0].toFixed(5)}, {takeOut[1].toFixed(5)}
                      </p>
                    </NavigateToPoint>
                  )}
                </div>
              </Section>
            )}
          </div>
        )}

        {/* ================================================================
            SECTION 3: Weather
            ================================================================ */}
        {weatherData.length > 0 && (() => {
          const days = weatherData
            .filter((w) => w.date >= new Date().toISOString().slice(0, 10))
            .slice(0, 7);

          function weatherIcon(w: WeatherDay) {
            if (w.snowfall > 0.5) return "\u2744\uFE0F";
            if (w.precipitation > 5) return "\uD83C\uDF27\uFE0F";
            if (w.precipitation > 0.5) return "\uD83C\uDF26\uFE0F";
            if (w.tempMax > 15) return "\u2600\uFE0F";
            if (w.tempMax > 5) return "\u26C5";
            return "\u2601\uFE0F";
          }

          return (
            <section className="mt-8">
              <div className="grid grid-cols-4 gap-1 text-center text-[11px] leading-tight sm:grid-cols-7 sm:gap-0">
                {days.map((w) => {
                  const isToday = w.date === new Date().toISOString().slice(0, 10);
                  return (
                    <div
                      key={w.date}
                      className={`rounded-lg px-1.5 py-2 sm:rounded-none sm:border-r sm:border-zinc-200 sm:dark:border-zinc-800 ${
                        isToday
                          ? "bg-blue-500/10 ring-1 ring-blue-500/20 sm:ring-0"
                          : "bg-zinc-100/50 dark:bg-zinc-900/50 sm:bg-transparent"
                      }`}
                    >
                      <div className="font-medium text-zinc-500 dark:text-zinc-400">
                        {isToday ? <T k="detail.today" /> : new Date(w.date + "T00:00:00Z").toLocaleDateString("en-CA", { weekday: "short" })}
                        {" - "}
                        {new Date(w.date + "T00:00:00Z").toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                      </div>
                      <div className="mt-0.5 text-lg leading-none">{weatherIcon(w)}</div>
                      <div className="mt-1 tabular-nums text-zinc-700 dark:text-zinc-300">
                        <span className="text-blue-500">{w.tempMin.toFixed(0)}</span>
                        <span className="text-zinc-400">/</span>
                        <span className="text-red-500">{w.tempMax.toFixed(0)}</span>
                        <span className="text-zinc-400 dark:text-zinc-500">&deg;</span>
                      </div>
                      {w.precipitation > 0.1 && (
                        <div className="mt-0.5 tabular-nums text-blue-400">
                          {w.precipitation.toFixed(1)}mm
                        </div>
                      )}
                      {w.snowfall > 0.1 && (
                        <div className="tabular-nums text-sky-300">
                          {w.snowfall.toFixed(1)}cm
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })()}
      </div>
    </div>
  );
}
