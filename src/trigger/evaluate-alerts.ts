import { logger, task } from "@trigger.dev/sdk/v3";
import { neon } from "@neondatabase/serverless";
import admin from "firebase-admin";

/**
 * Evaluate alert conditions for all stations and send notifications.
 *
 * Chained from refresh-all-stations, also has a fallback cron.
 * Inlines all logic (no @/ aliases) per Trigger.dev bundling constraints.
 */

// ---------------------------------------------------------------------------
// DB helper
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlFn = (query: string, params?: any[]) => Promise<any[]>;

function createSql(): SqlFn {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const neonSql = neon(process.env.DATABASE_URL);
  return (query, params) => neonSql.query(query, params ?? []);
}

// ---------------------------------------------------------------------------
// Inline paddling status (mirrors lib/notifications/paddling-status.ts)
// ---------------------------------------------------------------------------

interface PaddlingLevels {
  min?: number;
  ideal?: number;
  max?: number;
}

type PaddlingStatus = "too-low" | "runnable" | "ideal" | "too-high" | "unknown";

function getPaddlingStatus(
  flow: number | null | undefined,
  paddling: PaddlingLevels | undefined,
): PaddlingStatus {
  if (flow == null || !paddling) return "unknown";
  const { min, ideal, max } = paddling;
  if (min == null && ideal == null && max == null) return "unknown";
  if (min != null && flow < min) return "too-low";
  if (max != null && flow > max) return "too-high";
  if (min != null && ideal != null && flow <= ideal) return "runnable";
  if (ideal != null && max != null && flow >= ideal) return "ideal";
  if (min != null && max != null) return "runnable";
  return "runnable";
}

function isGoodRange(s: PaddlingStatus): boolean {
  return s === "runnable" || s === "ideal";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ForecastDay {
  date: string;
  flow: number;
  flowLow?: number;
  flowHigh?: number;
}

interface HourlyPoint {
  timestamp: string;
  observed: number | null;
  cehqForecast: number | null;
}

interface WeatherDay {
  date: string;
  precipitation?: number;
}

interface StationRow {
  id: string;
  name: string;
  regime: string | null;
  paddling_min: number | null;
  paddling_ideal: number | null;
  paddling_max: number | null;
}

interface CacheRow {
  station_id: string;
  forecast_json: {
    lastFlow?: { date: string; flow: number };
    forecastDays?: ForecastDay[];
  };
  hourly_json: HourlyPoint[] | null;
  weather_json: WeatherDay[] | null;
}

interface SnapshotRow {
  station_id: string;
  snapshot_json: StationSnapshot;
}

interface StationSnapshot {
  stationId: string;
  currentFlow: number | null;
  paddlingStatus: PaddlingStatus;
  runnableWindowDays: number;
  trendDirection: "rising" | "falling" | "stable";
  forecastEntersRange: boolean;
  forecastEntersRangeInDays: number | null;
  forecastExitsRange: boolean;
  forecastExitsRangeInHours: number | null;
  precipNext48h: number;
  confidenceLevel: "high" | "medium" | "low";
  evaluatedAt: string;
}

interface AlertCandidate {
  alertType: string;
  priority: "critical" | "high" | "normal" | "low";
  stationId: string;
  stationName: string;
  currentFlow: number | null;
  message: string;
}

interface SubscriptionRow {
  id: string;
  subscriber_id: string;
  station_id: string;
  email: string;
  token: string;
  preferences: Record<string, unknown>;
  sub_preferences: Record<string, unknown> | null;
}

interface AlertStateRow {
  subscription_id: string;
  alert_type: string;
  last_triggered: string | null;
}

// ---------------------------------------------------------------------------
// Priority & cooldown maps
// ---------------------------------------------------------------------------

const ALERT_PRIORITY: Record<string, string> = {
  "its-on": "critical",
  "safety-warning": "critical",
  "rain-bump": "high",
  "confidence-upgraded": "high",
  "runnable-in-n-days": "normal",
  "rising-into-range": "normal",
  "dropping-out": "normal",
};

const ALERT_COOLDOWN_MS: Record<string, number> = {
  "its-on": 6 * 3600_000,
  "safety-warning": 6 * 3600_000,
  "dropping-out": 12 * 3600_000,
  "rising-into-range": 12 * 3600_000,
  "runnable-in-n-days": 24 * 3600_000,
  "rain-bump": 24 * 3600_000,
  "confidence-upgraded": 24 * 3600_000,
};

/** Globally disabled alert types — never emitted regardless of user prefs. */
const DISABLED_ALERT_TYPES = new Set<string>([
  "dropping-out",
  "rain-bump",
  "confidence-upgraded",
]);

/** Lower = more important. Matches the admin notifications page order. */
const ALERT_RANK: Record<string, number> = {
  "its-on": 1,
  "safety-warning": 2,
  "dropping-out": 3,
  "runnable-in-n-days": 4,
  "rain-bump": 5,
  "confidence-upgraded": 6,
  "rising-into-range": 7,
};

// ---------------------------------------------------------------------------
// Bias correction (inlined from lib/forecast-correction.ts — Trigger.dev
// bundling requires everything inline, no @/ aliases)
// ---------------------------------------------------------------------------

const BIAS_MAX_OBS_STALENESS_HOURS = 24;
const BIAS_DECAY_HOURS = 24;
const BIAS_RATIO_MIN = 0.3;
const BIAS_RATIO_MAX = 2.0;
const BIAS_ACTIVE_THRESHOLD = 0.03;

interface ForecastCorrection {
  ratio: number | null;
  decayHours: number;
  active: boolean;
}

const NO_CORRECTION: ForecastCorrection = {
  ratio: null,
  decayHours: BIAS_DECAY_HOURS,
  active: false,
};

function buildForecastCorrection(
  hourlyData: HourlyPoint[],
  nowMs: number,
): ForecastCorrection {
  const maxStaleMs = BIAS_MAX_OBS_STALENESS_HOURS * 3600_000;

  let latestObs: { ts: number; flow: number } | null = null;
  let earliestFc: { ts: number; flow: number } | null = null;

  for (const p of hourlyData) {
    const ts = new Date(p.timestamp).getTime();
    if (ts <= nowMs && ts >= nowMs - maxStaleMs && p.observed != null) {
      if (!latestObs || ts > latestObs.ts) latestObs = { ts, flow: p.observed };
    }
    if (ts > nowMs && p.cehqForecast != null && p.cehqForecast > 0) {
      if (!earliestFc || ts < earliestFc.ts) earliestFc = { ts, flow: p.cehqForecast };
    }
  }

  if (!latestObs || !earliestFc) return NO_CORRECTION;

  const rawRatio = latestObs.flow / earliestFc.flow;
  const ratio = Math.max(BIAS_RATIO_MIN, Math.min(BIAS_RATIO_MAX, rawRatio));
  const active = Math.abs(ratio - 1) >= BIAS_ACTIVE_THRESHOLD;

  return { ratio, decayHours: BIAS_DECAY_HOURS, active };
}

function applyCorrection(
  rawFlow: number,
  hoursAhead: number,
  correction: ForecastCorrection,
): number {
  if (!correction.active || correction.ratio == null || hoursAhead < 0) return rawFlow;
  const effectiveRatio =
    1 + (correction.ratio - 1) * Math.exp(-hoursAhead / correction.decayHours);
  return rawFlow * effectiveRatio;
}

/** Hours-from-now midpoint for a daily forecast entry (`YYYY-MM-DD`). */
function dayMidpointHoursAhead(date: string, nowMs: number): number {
  const midpointMs = new Date(`${date}T12:00:00Z`).getTime();
  return (midpointMs - nowMs) / 3600_000;
}

// ---------------------------------------------------------------------------
// Snapshot computation
// ---------------------------------------------------------------------------

function computeSnapshot(
  stationId: string,
  cache: CacheRow,
  paddling: PaddlingLevels | undefined,
  now: Date,
): StationSnapshot {
  const currentFlow = cache.forecast_json?.lastFlow?.flow ?? null;
  const paddlingStatus = getPaddlingStatus(currentFlow, paddling);
  const forecastDays = cache.forecast_json?.forecastDays ?? [];
  const hourlyData = cache.hourly_json ?? [];
  const weatherDays = cache.weather_json ?? [];
  const nowMs = now.getTime();

  // Bias correction derived from recent observed vs. upcoming forecast.
  // Same signal used by the chart/status-pill — keeps all prediction-derived
  // UI and alerts in agreement.
  const correction = buildForecastCorrection(hourlyData, nowMs);

  // Runnable window (daily). Correct each day's flow with decay keyed to
  // the day's midpoint relative to now.
  let runnableWindowDays = 0;
  for (const day of forecastDays) {
    const h = dayMidpointHoursAhead(day.date, nowMs);
    const correctedFlow = applyCorrection(day.flow, h, correction);
    if (isGoodRange(getPaddlingStatus(correctedFlow, paddling))) runnableWindowDays++;
    else if (runnableWindowDays > 0) break;
  }

  // Trend from last 6 hourly points
  let trendDirection: "rising" | "falling" | "stable" = "stable";
  const recent = hourlyData.slice(-6);
  if (recent.length >= 2) {
    const flows = recent.map((p) => p.observed ?? p.cehqForecast).filter((f): f is number => f != null);
    if (flows.length >= 2) {
      const change = (flows[flows.length - 1] - flows[0]) / flows[0];
      if (change > 0.05) trendDirection = "rising";
      else if (change < -0.05) trendDirection = "falling";
    }
  }

  // Forecast enters range — apply correction per-day.
  let forecastEntersRange = false;
  let forecastEntersRangeInDays: number | null = null;
  if (!isGoodRange(paddlingStatus)) {
    for (let i = 0; i < forecastDays.length; i++) {
      const h = dayMidpointHoursAhead(forecastDays[i].date, nowMs);
      const correctedFlow = applyCorrection(forecastDays[i].flow, h, correction);
      if (isGoodRange(getPaddlingStatus(correctedFlow, paddling))) {
        forecastEntersRange = true;
        forecastEntersRangeInDays = i + 1;
        break;
      }
    }
  }

  // Forecast exits range — hourly first for precision, daily fallback.
  // Both paths apply the correction before the threshold check.
  let forecastExitsRange = false;
  let forecastExitsRangeInHours: number | null = null;
  if (isGoodRange(paddlingStatus)) {
    for (const point of hourlyData) {
      const flow = point.cehqForecast;
      if (flow == null) continue;
      const ts = new Date(point.timestamp).getTime();
      if (ts <= nowMs) continue;
      const hoursAhead = (ts - nowMs) / 3600_000;
      const correctedFlow = applyCorrection(flow, hoursAhead, correction);
      if (!isGoodRange(getPaddlingStatus(correctedFlow, paddling))) {
        forecastExitsRange = true;
        forecastExitsRangeInHours = hoursAhead;
        break;
      }
    }
    if (!forecastExitsRange) {
      for (let i = 0; i < forecastDays.length; i++) {
        const h = dayMidpointHoursAhead(forecastDays[i].date, nowMs);
        const correctedFlow = applyCorrection(forecastDays[i].flow, h, correction);
        if (!isGoodRange(getPaddlingStatus(correctedFlow, paddling))) {
          forecastExitsRange = true;
          forecastExitsRangeInHours = (i + 1) * 24;
          break;
        }
      }
    }
  }

  // Precip next 48h
  const todayStr = now.toISOString().slice(0, 10);
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + 2);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const precipNext48h = weatherDays
    .filter((w) => w.date >= todayStr && w.date <= cutoffStr)
    .reduce((sum, w) => sum + (w.precipitation ?? 0), 0);

  // Confidence
  let confidenceLevel: "high" | "medium" | "low" = "low";
  const widths: number[] = [];
  for (const d of forecastDays) {
    if (d.flowLow != null && d.flowHigh != null && d.flow > 0) {
      widths.push((d.flowHigh - d.flowLow) / d.flow);
    }
  }
  if (widths.length > 0) {
    const avg = widths.reduce((a, b) => a + b, 0) / widths.length;
    if (avg < 0.3) confidenceLevel = "high";
    else if (avg < 0.6) confidenceLevel = "medium";
  }

  return {
    stationId,
    currentFlow,
    paddlingStatus,
    runnableWindowDays,
    trendDirection,
    forecastEntersRange,
    forecastEntersRangeInDays,
    forecastExitsRange,
    forecastExitsRangeInHours,
    precipNext48h,
    confidenceLevel,
    evaluatedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Alert detection (differential)
// ---------------------------------------------------------------------------

function detectAlerts(
  curr: StationSnapshot,
  prev: StationSnapshot | null,
  stationName: string,
  paddling: PaddlingLevels | undefined,
  regime?: string | null,
): AlertCandidate[] {
  const alerts: AlertCandidate[] = [];
  const wasRunnable = prev ? isGoodRange(prev.paddlingStatus) : false;
  const nowRunnable = isGoodRange(curr.paddlingStatus);

  function add(type: string, msg: string) {
    if (DISABLED_ALERT_TYPES.has(type)) return;
    alerts.push({
      alertType: type,
      priority: (ALERT_PRIORITY[type] ?? "normal") as AlertCandidate["priority"],
      stationId: curr.stationId,
      stationName,
      currentFlow: curr.currentFlow,
      message: msg,
    });
  }

  const flow = curr.currentFlow?.toFixed(1) ?? "?";

  // its-on
  if (nowRunnable && !wasRunnable) {
    add("its-on", `${stationName} is now runnable at ${flow} m\u00b3/s. Time to paddle!`);
  }

  // safety-warning
  if (curr.paddlingStatus === "too-high" && prev?.paddlingStatus !== "too-high") {
    add("safety-warning", `${stationName} has exceeded safe levels at ${flow} m\u00b3/s. Exercise extreme caution.`);
  }

  // dropping-out
  if (nowRunnable && curr.forecastExitsRange && curr.forecastExitsRangeInHours != null && curr.forecastExitsRangeInHours > 12 && curr.forecastExitsRangeInHours <= 24) {
    add("dropping-out", `${stationName} expected to drop out of range in ~${Math.round(curr.forecastExitsRangeInHours)}h.`);
  }

  // runnable-in-n-days
  if (!nowRunnable && curr.forecastEntersRange && curr.forecastEntersRangeInDays != null) {
    const d = Math.round(curr.forecastEntersRangeInDays);
    add("runnable-in-n-days", `${stationName} predicted to become runnable in ${d} day${d === 1 ? "" : "s"}.`);
  }

  // rain-bump — skip for dam-influenced rivers (CEHQ: "Influencé")
  if (regime !== "Influencé" && curr.precipNext48h > 15 && (prev == null || prev.precipNext48h <= 15)) {
    add("rain-bump", `${curr.precipNext48h.toFixed(0)}mm of rain expected in 48h for ${stationName}. Flow may rise.`);
  }

  // confidence-upgraded
  if (curr.confidenceLevel === "high" && prev?.confidenceLevel === "medium") {
    add("confidence-upgraded", `Forecast confidence for ${stationName} upgraded to high.`);
  }

  // rising-into-range
  if (curr.trendDirection === "rising" && curr.paddlingStatus === "too-low" && curr.currentFlow != null && paddling?.min != null && curr.currentFlow > paddling.min * 0.8) {
    add("rising-into-range", `${stationName} is rising (${flow} m\u00b3/s) and approaching runnable range.`);
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Firebase Admin (lazy init)
// ---------------------------------------------------------------------------

function getFirebaseApp(): admin.app.App | null {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!json) return null;
  if (admin.apps.length > 0) return admin.apps[0]!;
  try {
    const credential = admin.credential.cert(JSON.parse(json));
    return admin.initializeApp({ credential });
  } catch (err) {
    logger.error("Firebase Admin init failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Send push notifications to all active devices whose station_ids overlap
 * with the alerted stations for a given subscriber.
 */
async function sendPushForAlerts(
  alerts: GroupedAlert[],
  dbSql: SqlFn,
  subscriberId?: string,
): Promise<number> {
  const app = getFirebaseApp();
  if (!app) return 0;

  const stationIds = alerts.map((a) => a.stationId);

  // Find active push devices that overlap with the alerted stations.
  // If a subscriber is known, narrow to their linked devices (and unlinked
  // devices — they ride along) so a shared email doesn't blast every paired phone.
  const deviceRows = subscriberId
    ? await dbSql(
        `SELECT token, platform, station_ids, preferences, subscriber_id FROM push_devices
         WHERE active = true AND station_ids && $1
           AND (subscriber_id = $2 OR subscriber_id IS NULL)`,
        [stationIds, subscriberId],
      )
    : await dbSql(
        `SELECT token, platform, station_ids, preferences, subscriber_id FROM push_devices
         WHERE active = true AND station_ids && $1`,
        [stationIds],
      );

  const devices = deviceRows as Array<{
    token: string;
    platform: string;
    station_ids: string[] | null;
    preferences: Record<string, unknown> | null;
    subscriber_id: string | null;
  }>;

  if (devices.length === 0) return 0;

  const messaging = admin.messaging(app);

  let sent = 0;
  for (const device of devices) {
    const devicePrefs = device.preferences ?? {};
    const pushEnabled = (devicePrefs.pushEnabled as boolean | undefined) ?? true;
    if (!pushEnabled) continue;

    const enabledTypes = devicePrefs.enabledAlertTypes as string[] | undefined;
    const deviceStationIds = new Set(device.station_ids ?? []);

    // Filter alerts for this device: must match one of the device's stations
    // AND (if set) be in the device's enabled alert types.
    const allowedAlerts = alerts.filter((a) => {
      if (!deviceStationIds.has(a.stationId)) return false;
      if (enabledTypes && !enabledTypes.includes(a.alertType)) return false;
      return true;
    });

    if (allowedAlerts.length === 0) continue;

    // Send one push per alert. Android auto-bundles 4+ notifications from
    // the same app into a stack; iOS groups them via thread-id even with 2.
    let tokenInvalidated = false;
    for (const alert of allowedAlerts) {
      const emoji = EMOJI[alert.alertType] ?? "\uD83D\uDCE2";
      const prefix = PREFIX[alert.alertType] ?? "Alert";

      try {
        await messaging.send({
          token: device.token,
          notification: {
            title: `${emoji} ${prefix} — ${alert.stationName}`,
            body: alert.message,
          },
          data: {
            stationId: alert.stationId,
            alertType: alert.alertType,
          },
          android: {
            priority: "high" as const,
            notification: {
              channelId: "river-alerts",
              // Per-station+type tag: a fresh alert of the same type for the
              // same river replaces the prior one rather than stacking dupes.
              tag: `flowcast-${alert.stationId}-${alert.alertType}`,
            },
          },
          apns: {
            payload: {
              aps: {
                "thread-id": "flowcast-river-alerts",
              },
            },
          },
        });
        sent++;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes("not-registered") || errMsg.includes("invalid-registration-token")) {
          await dbSql(`UPDATE push_devices SET active = false WHERE token = $1`, [device.token]);
          logger.warn("Deactivated stale push token", { token: device.token.slice(0, 12) + "..." });
          tokenInvalidated = true;
          break; // Don't retry remaining alerts on a dead token.
        }
        logger.error("FCM send failed", { error: errMsg, platform: device.platform });
      }
    }
    if (tokenInvalidated) continue;
  }

  return sent;
}

// ---------------------------------------------------------------------------
// Email sending (Resend API, no SDK)
// ---------------------------------------------------------------------------

interface GroupedAlert {
  alertType: string;
  rank: number;
  stationId: string;
  stationName: string;
  currentFlow: number | null;
  message: string;
  subscriptionId: string;
}

const EMOJI: Record<string, string> = {
  "its-on": "\uD83D\uDFE2", "safety-warning": "\uD83D\uDD34",
  "runnable-in-n-days": "\uD83D\uDCC5", "rain-bump": "\uD83C\uDF27\uFE0F",
  "confidence-upgraded": "\u2705", "rising-into-range": "\uD83D\uDCC8",
  "dropping-out": "\uD83D\uDCC9",
};

const PREFIX: Record<string, string> = {
  "its-on": "Go paddle!", "safety-warning": "Safety warning",
  "runnable-in-n-days": "Coming soon", "rain-bump": "Rain incoming",
  "confidence-upgraded": "Forecast confirmed", "rising-into-range": "Rising into range",
  "dropping-out": "Dropping out",
};

/**
 * Send a single email containing one or more river alerts.
 * Single alert → classic layout. Multiple alerts → card per river.
 */
async function sendGroupedAlertEmail(
  to: string,
  alerts: GroupedAlert[],
  manageToken: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn("RESEND_API_KEY not set, skipping email");
    return false;
  }

  const from = process.env.NOTIFICATION_FROM_EMAIL ?? "FlowCast <pierre@leduc.tech>";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  const unsubUrl = `${appUrl}/api/notifications/unsubscribe?token=${manageToken}`;
  const manageUrl = `${appUrl}/notifications?token=${manageToken}`;

  // Alerts arrive pre-sorted by rank (most important first)
  const top = alerts[0];
  const topEmoji = EMOJI[top.alertType] ?? "\uD83D\uDCE2";
  const topPrefix = PREFIX[top.alertType] ?? "Alert";

  // Subject line
  const subject = alerts.length === 1
    ? `${topEmoji} ${topPrefix} \u2014 ${top.stationName}`
    : `${topEmoji} ${topPrefix} \u2014 ${top.stationName} (+${alerts.length - 1} more)`;

  // Build body
  let body: string;

  if (alerts.length === 1) {
    // Single alert — same layout as before
    const flowLine = top.currentFlow != null
      ? `<p style="color:#52525b;">Current flow: <strong>${top.currentFlow.toFixed(1)} m&sup3;/s</strong></p>`
      : "";
    body = `<h2 style="margin:0 0 16px;font-size:18px;">${topEmoji} ${top.stationName}</h2>
<p style="color:#18181b;font-size:16px;line-height:1.6;">${top.message}</p>
${flowLine}
<div style="margin:24px 0;">
<a href="${appUrl}/rivers/${encodeURIComponent(top.stationId)}" style="display:inline-block;padding:10px 20px;background:#2D8FCC;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">View River</a>
<a href="${manageUrl}" style="display:inline-block;padding:10px 20px;margin-left:8px;background:#f4f4f5;color:#52525b;text-decoration:none;border-radius:8px;">Manage Alerts</a>
</div>`;
  } else {
    // Multiple alerts — one card per river
    const cards = alerts.map((a) => {
      const aEmoji = EMOJI[a.alertType] ?? "\uD83D\uDCE2";
      const flowText = a.currentFlow != null ? ` &mdash; ${a.currentFlow.toFixed(1)} m&sup3;/s` : "";
      return `<div style="margin-bottom:12px;padding:14px 16px;border:1px solid #e4e4e7;border-radius:8px;background:#fafafa;">
<div style="font-size:15px;font-weight:600;color:#18181b;">${aEmoji} ${a.stationName}<span style="font-weight:400;color:#71717a;font-size:13px;">${flowText}</span></div>
<p style="margin:6px 0 10px;color:#52525b;font-size:14px;line-height:1.5;">${a.message}</p>
<a href="${appUrl}/rivers/${encodeURIComponent(a.stationId)}" style="display:inline-block;padding:6px 14px;background:#2D8FCC;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">View River</a>
</div>`;
    }).join("");

    body = `<h2 style="margin:0 0 16px;font-size:18px;">\uD83D\uDD14 ${alerts.length} River Updates</h2>
${cards}
<div style="margin-top:16px;">
<a href="${manageUrl}" style="display:inline-block;padding:10px 20px;background:#f4f4f5;color:#52525b;text-decoration:none;border-radius:8px;">Manage Alerts</a>
</div>`;
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;border:1px solid #e4e4e7;">
<div style="background:#2D8FCC;padding:20px 24px;"><h1 style="margin:0;color:#fff;font-size:20px;">FlowCast</h1></div>
<div style="padding:24px;">${body}</div>
<div style="padding:16px 24px;border-top:1px solid #e4e4e7;background:#fafafa;font-size:13px;color:#71717a;">
<a href="${unsubUrl}" style="color:#71717a;">Unsubscribe</a></div></div></body></html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const resBody = await res.text().catch(() => "");
      logger.error(`Resend API error ${res.status}: ${resBody}`, { to, alertTypes: alerts.map((a) => a.alertType), from });
    }
    return res.ok;
  } catch (err) {
    logger.error("Resend API fetch failed", { error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Cooldown check
// ---------------------------------------------------------------------------

function isInCooldown(alertType: string, states: AlertStateRow[], now: Date): boolean {
  const state = states.find((s) => s.alert_type === alertType);
  if (!state?.last_triggered) return false;
  const elapsed = now.getTime() - new Date(state.last_triggered).getTime();
  return elapsed < (ALERT_COOLDOWN_MS[alertType] ?? 0);
}

// ---------------------------------------------------------------------------
// Main task
// ---------------------------------------------------------------------------

export const evaluateAlerts = task({
  id: "evaluate-alerts",
  maxDuration: 120,
  run: async (payload: { triggeredBy?: string }) => {
    const dbSql = createSql();
    const now = new Date();

    logger.info("Starting alert evaluation", { triggeredBy: payload.triggeredBy });

    // 1. Load stations with paddling thresholds
    const stations = (await dbSql(
      `SELECT id, name, regime, paddling_min, paddling_ideal, paddling_max
       FROM stations WHERE status != 'error'`,
    )) as StationRow[];

    // 2. Load forecast cache
    const cacheRows = (await dbSql(
      `SELECT station_id, forecast_json, hourly_json, weather_json FROM forecast_cache`,
    )) as CacheRow[];
    const cacheMap = new Map(cacheRows.map((r) => [r.station_id, r]));

    // 3. Load previous snapshots
    const snapshotRows = (await dbSql(
      `SELECT station_id, snapshot_json FROM alert_snapshots`,
    )) as SnapshotRow[];
    const prevSnapshots = new Map(snapshotRows.map((r) => [r.station_id, r.snapshot_json]));

    // 4. Load all active subscriptions with subscriber info
    const subscriptions = (await dbSql(
      `SELECT sub.id, sub.subscriber_id, sub.station_id,
              s.email, s.token, s.preferences,
              sub.preferences as sub_preferences
       FROM subscriptions sub
       JOIN subscribers s ON s.id = sub.subscriber_id
       WHERE sub.active = true AND s.confirmed = true`,
    )) as SubscriptionRow[];

    // Group subscriptions by station
    const subsByStation = new Map<string, SubscriptionRow[]>();
    for (const sub of subscriptions) {
      const list = subsByStation.get(sub.station_id) ?? [];
      list.push(sub);
      subsByStation.set(sub.station_id, list);
    }

    // -----------------------------------------------------------------------
    // Phase 1: Evaluate all stations, collect candidates, save snapshots
    // -----------------------------------------------------------------------

    const stationCandidates = new Map<string, AlertCandidate[]>();
    const stationSnapshots = new Map<string, StationSnapshot>();
    const stationPaddlings = new Map<string, PaddlingLevels>();

    for (const station of stations) {
      const cache = cacheMap.get(station.id);
      if (!cache) continue;

      const paddling: PaddlingLevels = {
        min: station.paddling_min ?? undefined,
        ideal: station.paddling_ideal ?? undefined,
        max: station.paddling_max ?? undefined,
      };
      stationPaddlings.set(station.id, paddling);

      const snapshot = computeSnapshot(station.id, cache, paddling, now);
      stationSnapshots.set(station.id, snapshot);
      const prevSnapshot = prevSnapshots.get(station.id) ?? null;

      const candidates = detectAlerts(snapshot, prevSnapshot, station.name, paddling, station.regime);

      if (candidates.length > 0) {
        logger.info(`Station ${station.id}: ${candidates.length} alert candidates`, {
          types: candidates.map((c) => c.alertType),
        });
        stationCandidates.set(station.id, candidates);
      }

      // Save updated snapshot
      await dbSql(
        `INSERT INTO alert_snapshots (station_id, snapshot_json, evaluated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (station_id) DO UPDATE SET
           snapshot_json = EXCLUDED.snapshot_json,
           evaluated_at = now()`,
        [station.id, JSON.stringify(snapshot)],
      );
    }

    // -----------------------------------------------------------------------
    // Phase 2: Collect filtered alerts per subscriber (across all stations)
    // -----------------------------------------------------------------------

    const subscriberBucket = new Map<string, {
      email: string;
      token: string;
      emailEnabled: boolean;
      alerts: GroupedAlert[];
    }>();

    for (const station of stations) {
      const candidates = stationCandidates.get(station.id);
      if (!candidates || candidates.length === 0) continue;

      const snapshot = stationSnapshots.get(station.id)!;
      const stationSubs = subsByStation.get(station.id) ?? [];

      for (const sub of stationSubs) {
        const alertStates = (await dbSql(
          `SELECT alert_type, last_triggered FROM alert_state
           WHERE subscription_id = $1`,
          [sub.id],
        )) as AlertStateRow[];

        const prefs = { ...sub.preferences, ...(sub.sub_preferences ?? {}) };
        const leadTimeDays = (prefs.leadTimeDays as number) ?? 2;
        const weekendOnly = (prefs.weekendOnly as boolean) ?? false;
        const digestMode = (prefs.digestMode as boolean) ?? false;
        const emailEnabled = (prefs.emailEnabled as boolean | undefined) ?? true;
        const enabledAlertTypes = prefs.enabledAlertTypes as string[] | undefined;

        for (const candidate of candidates) {
          if (isInCooldown(candidate.alertType, alertStates, now)) continue;

          // User-level opt-out for this alert type
          if (enabledAlertTypes && !enabledAlertTypes.includes(candidate.alertType)) continue;

          if (candidate.alertType === "runnable-in-n-days" && snapshot.forecastEntersRangeInDays != null) {
            if (snapshot.forecastEntersRangeInDays > leadTimeDays) continue;
          }

          if (weekendOnly && candidate.priority !== "critical") {
            const day = now.getDay();
            if (day !== 0 && day !== 4 && day !== 5 && day !== 6) continue;
          }

          if (digestMode && (candidate.priority === "normal" || candidate.priority === "low")) continue;

          // Add to subscriber bucket
          if (!subscriberBucket.has(sub.subscriber_id)) {
            subscriberBucket.set(sub.subscriber_id, {
              email: sub.email,
              token: sub.token,
              emailEnabled,
              alerts: [],
            });
          }
          subscriberBucket.get(sub.subscriber_id)!.alerts.push({
            alertType: candidate.alertType,
            rank: ALERT_RANK[candidate.alertType] ?? 99,
            stationId: candidate.stationId,
            stationName: candidate.stationName,
            currentFlow: candidate.currentFlow,
            message: candidate.message,
            subscriptionId: sub.id,
          });
        }
      }
    }

    // -----------------------------------------------------------------------
    // Phase 3: Per subscriber — keep best alert per station, send ONE email
    // -----------------------------------------------------------------------

    let totalAlerts = 0;
    let totalEmails = 0;
    let totalPushes = 0;

    for (const [subscriberId, bucket] of Array.from(subscriberBucket.entries())) {
      // Deduplicate: keep only the top-ranked alert per station
      const bestByStation = new Map<string, GroupedAlert>();
      for (const alert of bucket.alerts) {
        const existing = bestByStation.get(alert.stationId);
        if (!existing || alert.rank < existing.rank) {
          bestByStation.set(alert.stationId, alert);
        }
      }

      const finalAlerts = Array.from(bestByStation.values()).sort((a, b) => a.rank - b.rank);
      if (finalAlerts.length === 0) continue;

      logger.info(`Subscriber ${subscriberId}: sending 1 email with ${finalAlerts.length} river alert(s)`, {
        types: finalAlerts.map((a) => `${a.stationId}:${a.alertType}`),
      });

      // Send ONE grouped email (skipped when user has disabled email channel)
      const sent = bucket.emailEnabled
        ? await sendGroupedAlertEmail(bucket.email, finalAlerts, bucket.token)
        : false;

      // Send push notifications to this subscriber's linked devices
      const pushCount = await sendPushForAlerts(finalAlerts, dbSql, subscriberId);
      totalPushes += pushCount;

      // Log + update state for each included alert
      for (const alert of finalAlerts) {
        await dbSql(
          `INSERT INTO notification_log (subscriber_id, station_id, alert_type, priority, subject, sent_at, delivered)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            subscriberId,
            alert.stationId,
            alert.alertType,
            ALERT_PRIORITY[alert.alertType] ?? "normal",
            `${alert.alertType}: ${alert.stationName}`,
            sent ? now.toISOString() : null,
            sent,
          ],
        );

        await dbSql(
          `INSERT INTO alert_state (subscription_id, alert_type, state, last_triggered, last_evaluated)
           VALUES ($1, $2, 'triggered', now(), now())
           ON CONFLICT (subscription_id, alert_type) DO UPDATE SET
             state = 'triggered',
             last_triggered = now(),
             last_evaluated = now()`,
          [alert.subscriptionId, alert.alertType],
        );

        totalAlerts++;
      }
      if (sent) totalEmails++;
    }

    logger.info(`Alert evaluation complete: ${totalAlerts} alerts, ${totalEmails} emails, ${totalPushes} push notifications sent`);

    return { totalAlerts, totalEmails, totalPushes, stationsEvaluated: stations.length };
  },
});
