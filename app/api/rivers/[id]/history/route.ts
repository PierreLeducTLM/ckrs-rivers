import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";
import {
  ensureHourlyHistory,
  getHourlyHistory,
} from "@/lib/data/flow-history";
import { getPredictor } from "@/lib/prediction/registry";
import { computePredictorOverlay } from "@/lib/prediction/overlay";
import type { FlowReading } from "@/lib/domain/flow-reading";

export const dynamic = "force-dynamic";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_DAYS = 31;

function labelFor(ts: number): string {
  return new Date(ts).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

/**
 * GET /api/rivers/[id]/history?end={ISO}&days={n}
 *
 * Returns a window of historical hourly flow (and, when the station has a
 * predictor, the predicted value at each hour) for the chart's back-in-time
 * navigation. Lazily backfills from CEHQ's instantaneous archive on first
 * request for a year.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sp = request.nextUrl.searchParams;

  const endParam = sp.get("end");
  const endMs = (() => {
    const parsed = endParam ? Date.parse(endParam) : NaN;
    return Number.isFinite(parsed) ? parsed : Date.now();
  })();

  const daysRaw = Number(sp.get("days") ?? "7");
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.round(daysRaw), 1), MAX_DAYS) : 7;
  const startMs = endMs - days * DAY_MS;

  // Observed flow for the displayed station.
  let observed: Awaited<ReturnType<typeof getHourlyHistory>> = [];
  try {
    await ensureHourlyHistory(id, startMs, endMs);
    observed = await getHourlyHistory(id, startMs, endMs);
  } catch (err) {
    console.error(`[history] ${id}: observed lookup failed`, err);
  }

  // Predictor overlay (if assigned) computed over the reference station's
  // hourly history for the same window.
  let predictorUnit: string | undefined;
  let predictorLabel: string | undefined;
  let predictorByTs = new Map<number, number>();
  try {
    const stationRows = (await sql(
      `SELECT predictor_key FROM stations WHERE id = $1`,
      [id],
    )) as Array<{ predictor_key: string | null }>;
    const predictorKey = stationRows[0]?.predictor_key ?? null;
    const predictor = getPredictor(predictorKey);

    if (predictorKey && predictor) {
      await ensureHourlyHistory(predictor.referenceStationId, startMs, endMs);
      const refHistory = await getHourlyHistory(
        predictor.referenceStationId,
        startMs,
        endMs,
      );
      const readings: FlowReading[] = refHistory.map((p) => ({
        stationId: predictor.referenceStationId,
        timestamp: p.timestamp,
        flow: p.flow as FlowReading["flow"],
        source: "gauge",
        quality: "provisional",
      }));
      const overlay = computePredictorOverlay(predictorKey, readings);
      if (overlay) {
        predictorUnit = overlay.unit;
        predictorLabel = overlay.label;
        predictorByTs = overlay.byTs;
      }
    }
  } catch (err) {
    console.error(`[history] ${id}: predictor overlay failed`, err);
  }

  const points = observed.map((p) => {
    const ts = Date.parse(p.timestamp);
    return {
      timestamp: p.timestamp,
      label: labelFor(ts),
      observed: p.flow,
      predicted: null,
      confidenceLow: null,
      confidenceHigh: null,
      cehqForecast: null,
      predictorValue: predictorByTs.get(ts) ?? null,
    };
  });

  return Response.json({
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    days,
    points,
    predictorUnit,
    predictorLabel,
  });
}
