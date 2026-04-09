import { logger, task } from "@trigger.dev/sdk/v3";
import { neon } from "@neondatabase/serverless";

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
  "last-call": "high",
  "rain-bump": "high",
  "confidence-upgraded": "high",
  "season-opener": "high",
  "runnable-in-n-days": "normal",
  "rising-into-range": "normal",
  "window-extended": "normal",
  "window-shortened": "normal",
  "dropping-out": "normal",
  "river-is-back": "normal",
  "spring-melt-update": "low",
  "nearby-alternative": "low",
};

const ALERT_COOLDOWN_MS: Record<string, number> = {
  "its-on": 6 * 3600_000,
  "safety-warning": 6 * 3600_000,
  "last-call": 12 * 3600_000,
  "dropping-out": 12 * 3600_000,
  "rising-into-range": 12 * 3600_000,
  "runnable-in-n-days": 24 * 3600_000,
  "rain-bump": 24 * 3600_000,
  "confidence-upgraded": 24 * 3600_000,
  "window-extended": 24 * 3600_000,
  "window-shortened": 24 * 3600_000,
  "nearby-alternative": 24 * 3600_000,
  "season-opener": 365 * 24 * 3600_000,
  "spring-melt-update": 7 * 24 * 3600_000,
  "river-is-back": 14 * 24 * 3600_000,
};

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

  // Runnable window
  let runnableWindowDays = 0;
  for (const day of forecastDays) {
    if (isGoodRange(getPaddlingStatus(day.flow, paddling))) runnableWindowDays++;
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

  // Forecast enters range
  let forecastEntersRange = false;
  let forecastEntersRangeInDays: number | null = null;
  if (!isGoodRange(paddlingStatus)) {
    for (let i = 0; i < forecastDays.length; i++) {
      if (isGoodRange(getPaddlingStatus(forecastDays[i].flow, paddling))) {
        forecastEntersRange = true;
        forecastEntersRangeInDays = i + 1;
        break;
      }
    }
  }

  // Forecast exits range (check hourly first for precision, fallback to daily)
  let forecastExitsRange = false;
  let forecastExitsRangeInHours: number | null = null;
  if (isGoodRange(paddlingStatus)) {
    // Hourly check for sub-24h precision
    const nowMs = now.getTime();
    for (const point of hourlyData) {
      const flow = point.cehqForecast;
      if (flow == null) continue;
      const ts = new Date(point.timestamp).getTime();
      if (ts <= nowMs) continue;
      if (!isGoodRange(getPaddlingStatus(flow, paddling))) {
        forecastExitsRange = true;
        forecastExitsRangeInHours = (ts - nowMs) / (1000 * 60 * 60);
        break;
      }
    }
    // Daily fallback if hourly didn't find an exit
    if (!forecastExitsRange) {
      for (let i = 0; i < forecastDays.length; i++) {
        if (!isGoodRange(getPaddlingStatus(forecastDays[i].flow, paddling))) {
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
): AlertCandidate[] {
  const alerts: AlertCandidate[] = [];
  const wasRunnable = prev ? isGoodRange(prev.paddlingStatus) : false;
  const nowRunnable = isGoodRange(curr.paddlingStatus);

  function add(type: string, msg: string) {
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

  // last-call
  if (nowRunnable && curr.forecastExitsRange && curr.forecastExitsRangeInHours != null && curr.forecastExitsRangeInHours <= 12) {
    add("last-call", `${stationName} is still runnable but leaving range in ~${Math.round(curr.forecastExitsRangeInHours)}h. Last chance!`);
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

  // rain-bump
  if (curr.precipNext48h > 15 && (prev == null || prev.precipNext48h <= 15)) {
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

  // window-extended
  if (prev && curr.runnableWindowDays > prev.runnableWindowDays && curr.runnableWindowDays - prev.runnableWindowDays >= 1) {
    add("window-extended", `Runnable window for ${stationName} extended to ${curr.runnableWindowDays} days.`);
  }

  // window-shortened
  if (prev && prev.runnableWindowDays > 0 && curr.runnableWindowDays < prev.runnableWindowDays) {
    add("window-shortened", `Runnable window for ${stationName} shortened to ${curr.runnableWindowDays} day${curr.runnableWindowDays === 1 ? "" : "s"}.`);
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Email sending (Resend API, no SDK)
// ---------------------------------------------------------------------------

async function sendAlertEmail(
  to: string,
  stationName: string,
  alertType: string,
  message: string,
  currentFlow: number | null,
  manageToken: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn("RESEND_API_KEY not set, skipping email");
    return false;
  }

  const from = process.env.NOTIFICATION_FROM_EMAIL ?? "Kayak Rivière aux Sables <onboarding@resend.dev>";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const unsubUrl = `${appUrl}/api/notifications/unsubscribe?token=${manageToken}`;
  const manageUrl = `${appUrl}/notifications?token=${manageToken}`;

  const EMOJI: Record<string, string> = {
    "its-on": "\uD83D\uDFE2", "last-call": "\u23F0", "safety-warning": "\uD83D\uDD34",
    "runnable-in-n-days": "\uD83D\uDCC5", "rain-bump": "\uD83C\uDF27\uFE0F",
    "confidence-upgraded": "\u2705", "rising-into-range": "\uD83D\uDCC8",
    "window-extended": "\u2795", "window-shortened": "\u2796",
    "dropping-out": "\uD83D\uDCC9", "season-opener": "\uD83C\uDF89",
    "river-is-back": "\uD83D\uDCA7", "nearby-alternative": "\uD83D\uDD04",
  };

  const PREFIX: Record<string, string> = {
    "its-on": "Go paddle!", "last-call": "Last call", "safety-warning": "Safety warning",
    "runnable-in-n-days": "Coming soon", "rain-bump": "Rain incoming",
    "confidence-upgraded": "Forecast confirmed", "rising-into-range": "Rising into range",
    "window-extended": "Window extended", "window-shortened": "Window shortened",
    "dropping-out": "Dropping out", "season-opener": "Season opener!",
    "river-is-back": "River is back!", "nearby-alternative": "Try another river",
  };

  const emoji = EMOJI[alertType] ?? "\uD83D\uDCE2";
  const prefix = PREFIX[alertType] ?? "Alert";
  const subject = `${emoji} ${prefix} \u2014 ${stationName}`;
  const flowLine = currentFlow != null ? `<p style="color:#52525b;">Current flow: <strong>${currentFlow.toFixed(1)} m&sup3;/s</strong></p>` : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;border:1px solid #e4e4e7;">
<div style="background:#2D8FCC;padding:20px 24px;"><h1 style="margin:0;color:#fff;font-size:20px;">Kayak Rivi&egrave;re aux Sables</h1></div>
<div style="padding:24px;">
<h2 style="margin:0 0 16px;font-size:18px;">${emoji} ${stationName}</h2>
<p style="color:#18181b;font-size:16px;line-height:1.6;">${message}</p>
${flowLine}
<div style="margin:24px 0;">
<a href="${appUrl}" style="display:inline-block;padding:10px 20px;background:#2D8FCC;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">View River</a>
<a href="${manageUrl}" style="display:inline-block;padding:10px 20px;margin-left:8px;background:#f4f4f5;color:#52525b;text-decoration:none;border-radius:8px;">Manage Alerts</a>
</div></div>
<div style="padding:16px 24px;border-top:1px solid #e4e4e7;background:#fafafa;font-size:13px;color:#71717a;">
<a href="${unsubUrl}" style="color:#71717a;">Unsubscribe</a></div></div></body></html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    return res.ok;
  } catch {
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
      `SELECT id, name, paddling_min, paddling_ideal, paddling_max
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

    let totalAlerts = 0;
    let totalEmails = 0;

    // 5. Evaluate each station
    for (const station of stations) {
      const cache = cacheMap.get(station.id);
      if (!cache) continue;

      const paddling: PaddlingLevels = {
        min: station.paddling_min ?? undefined,
        ideal: station.paddling_ideal ?? undefined,
        max: station.paddling_max ?? undefined,
      };

      // Compute current snapshot
      const snapshot = computeSnapshot(station.id, cache, paddling, now);
      const prevSnapshot = prevSnapshots.get(station.id) ?? null;

      // Detect alert candidates
      const candidates = detectAlerts(snapshot, prevSnapshot, station.name, paddling);

      if (candidates.length > 0) {
        logger.info(`Station ${station.id}: ${candidates.length} alert candidates`, {
          types: candidates.map((c) => c.alertType),
        });
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

      // Process alerts for each subscriber
      const stationSubs = subsByStation.get(station.id) ?? [];
      for (const sub of stationSubs) {
        // Load alert states for this subscription
        const alertStates = (await dbSql(
          `SELECT alert_type, last_triggered FROM alert_state
           WHERE subscription_id = $1`,
          [sub.id],
        )) as AlertStateRow[];

        // Merge preferences
        const prefs = { ...sub.preferences, ...(sub.sub_preferences ?? {}) };
        const leadTimeDays = (prefs.leadTimeDays as number) ?? 2;
        const weekendOnly = (prefs.weekendOnly as boolean) ?? false;
        const digestMode = (prefs.digestMode as boolean) ?? false;

        for (const candidate of candidates) {
          // Cooldown check
          if (isInCooldown(candidate.alertType, alertStates, now)) continue;

          // Lead time check for runnable-in-n-days
          if (candidate.alertType === "runnable-in-n-days" && snapshot.forecastEntersRangeInDays != null) {
            if (snapshot.forecastEntersRangeInDays > leadTimeDays) continue;
          }

          // Weekend-only check
          if (weekendOnly && candidate.priority !== "critical") {
            const day = now.getDay();
            if (day !== 0 && day !== 4 && day !== 5 && day !== 6) continue;
          }

          // Digest mode: skip normal/low if digest mode (they'll go in the digest task)
          if (digestMode && (candidate.priority === "normal" || candidate.priority === "low")) continue;

          // Send email
          const sent = await sendAlertEmail(
            sub.email,
            candidate.stationName,
            candidate.alertType,
            candidate.message,
            candidate.currentFlow,
            sub.token,
          );

          // Log notification
          await dbSql(
            `INSERT INTO notification_log (subscriber_id, station_id, alert_type, priority, subject, sent_at, delivered)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              sub.subscriber_id,
              station.id,
              candidate.alertType,
              candidate.priority,
              `${candidate.alertType}: ${candidate.stationName}`,
              sent ? now.toISOString() : null,
              sent,
            ],
          );

          // Update alert state
          await dbSql(
            `INSERT INTO alert_state (subscription_id, alert_type, state, last_triggered, last_evaluated)
             VALUES ($1, $2, 'triggered', now(), now())
             ON CONFLICT (subscription_id, alert_type) DO UPDATE SET
               state = 'triggered',
               last_triggered = now(),
               last_evaluated = now()`,
            [sub.id, candidate.alertType],
          );

          totalAlerts++;
          if (sent) totalEmails++;
        }
      }
    }

    logger.info(`Alert evaluation complete: ${totalAlerts} alerts, ${totalEmails} emails sent`);

    return { totalAlerts, totalEmails, stationsEvaluated: stations.length };
  },
});
