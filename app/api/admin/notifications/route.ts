import { NextRequest } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";

import { sql } from "@/lib/db/client";

// ---------------------------------------------------------------------------
// Test station constants
// ---------------------------------------------------------------------------

const TEST_STATION_ID = "TEST-000000";
const TEST_STATION = {
  id: TEST_STATION_ID,
  stationNumber: "000000",
  name: "Rivière Test (Admin)",
  lat: 46.8,
  lon: -71.2,
  paddlingMin: 10,
  paddlingIdeal: 20,
  paddlingMax: 35,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dayOffset(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function hourOffset(hours: number) {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  // Round to the hour
  d.setMinutes(0, 0, 0);
  return d.toISOString().replace(".000Z", "Z");
}

/** Generate hourly data points for the last N hours + next M hours */
function makeHourly(
  currentFlow: number,
  trend: "rising" | "falling" | "stable",
  pastHours = 8,
  futureHours = 24,
  futureFlow?: number,
) {
  const points: Array<{
    timestamp: string;
    label: string;
    observed: number | null;
    cehqForecast: number | null;
    cehqLow: number | null;
    cehqHigh: number | null;
  }> = [];

  const trendDelta =
    trend === "rising" ? 0.15 : trend === "falling" ? -0.1 : 0;

  // Past observed points
  for (let h = -pastHours; h <= 0; h++) {
    const flow = currentFlow + currentFlow * trendDelta * (h / pastHours);
    const ts = hourOffset(h);
    points.push({
      timestamp: ts,
      label: ts.slice(5, 13),
      observed: Math.round(flow * 10) / 10,
      cehqForecast: null,
      cehqLow: null,
      cehqHigh: null,
    });
  }

  // Future forecast points
  const targetFlow = futureFlow ?? currentFlow;
  for (let h = 1; h <= futureHours; h++) {
    const progress = h / futureHours;
    const flow = currentFlow + (targetFlow - currentFlow) * progress;
    const ts = hourOffset(h);
    points.push({
      timestamp: ts,
      label: ts.slice(5, 13),
      observed: null,
      cehqForecast: Math.round(flow * 10) / 10,
      cehqLow: Math.round(flow * 0.85 * 10) / 10,
      cehqHigh: Math.round(flow * 1.15 * 10) / 10,
    });
  }

  return points;
}

function makeWeather(precipMm: number, days = 5) {
  return Array.from({ length: days }, (_, i) => ({
    date: dayOffset(i),
    tempMin: 8 + i,
    tempMax: 18 + i,
    tempMean: 13 + i,
    precipitation: i < 2 ? precipMm / 2 : 2,
    snowfall: 0,
    snowDepth: 0,
  }));
}

function makeSnapshot(overrides: Record<string, unknown>) {
  return {
    stationId: TEST_STATION_ID,
    currentFlow: 15,
    paddlingStatus: "runnable",
    runnableWindowDays: 3,
    trendDirection: "stable",
    forecastEntersRange: false,
    forecastEntersRangeInDays: null,
    forecastExitsRange: false,
    forecastExitsRangeInHours: null,
    precipNext48h: 5,
    confidenceLevel: "medium",
    isSeasonFirst: false,
    evaluatedAt: new Date(Date.now() - 900_000).toISOString(), // 15 min ago
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Scenario definitions
// ---------------------------------------------------------------------------

interface ScenarioData {
  forecastJson: { lastFlow: { date: string; flow: number } | null; forecastDays: Array<{ date: string; flow: number; flowLow?: number; flowHigh?: number }> };
  hourlyJson: ReturnType<typeof makeHourly>;
  weatherJson: ReturnType<typeof makeWeather>;
  previousSnapshot: ReturnType<typeof makeSnapshot>;
}

function buildScenario(alertType: string): ScenarioData {
  const { paddlingMin: min, paddlingIdeal: ideal, paddlingMax: max } = TEST_STATION;

  switch (alertType) {
    // ---- its-on: was too-low, now runnable ----
    case "its-on":
      return {
        forecastJson: {
          lastFlow: { date: today(), flow: min + 5 },
          forecastDays: [
            { date: dayOffset(1), flow: min + 8, flowLow: min + 4, flowHigh: min + 12 },
            { date: dayOffset(2), flow: ideal, flowLow: min + 5, flowHigh: ideal + 5 },
          ],
        },
        hourlyJson: makeHourly(min + 5, "rising"),
        weatherJson: makeWeather(8),
        previousSnapshot: makeSnapshot({
          currentFlow: min - 2,
          paddlingStatus: "too-low",
          runnableWindowDays: 0,
          trendDirection: "rising",
        }),
      };

    // ---- safety-warning: was runnable, now too-high ----
    case "safety-warning":
      return {
        forecastJson: {
          lastFlow: { date: today(), flow: max + 10 },
          forecastDays: [
            { date: dayOffset(1), flow: max + 5, flowLow: max, flowHigh: max + 15 },
            { date: dayOffset(2), flow: max - 5, flowLow: max - 10, flowHigh: max + 5 },
          ],
        },
        hourlyJson: makeHourly(max + 10, "stable"),
        weatherJson: makeWeather(25),
        previousSnapshot: makeSnapshot({
          currentFlow: max - 5,
          paddlingStatus: "runnable",
        }),
      };

    // ---- last-call: currently runnable, exits within 12h ----
    case "last-call":
      return {
        forecastJson: {
          lastFlow: { date: today(), flow: min + 3 },
          forecastDays: [
            { date: dayOffset(1), flow: min - 3, flowLow: min - 5, flowHigh: min - 1 },
          ],
        },
        hourlyJson: makeHourly(min + 3, "falling", 8, 24, min - 5),
        weatherJson: makeWeather(2),
        previousSnapshot: makeSnapshot({
          currentFlow: min + 5,
          paddlingStatus: "runnable",
          runnableWindowDays: 2,
        }),
      };

    // ---- dropping-out: currently runnable, exits in 12-24h ----
    case "dropping-out":
      return {
        forecastJson: {
          lastFlow: { date: today(), flow: min + 5 },
          forecastDays: [
            { date: dayOffset(1), flow: min - 2, flowLow: min - 4, flowHigh: min },
            { date: dayOffset(2), flow: min - 5, flowLow: min - 8, flowHigh: min - 2 },
          ],
        },
        hourlyJson: makeHourly(min + 5, "falling", 8, 36, min - 5),
        weatherJson: makeWeather(3),
        previousSnapshot: makeSnapshot({
          currentFlow: min + 8,
          paddlingStatus: "runnable",
          runnableWindowDays: 3,
        }),
      };

    // ---- runnable-in-n-days: too-low, enters range in 2 days ----
    case "runnable-in-n-days":
      return {
        forecastJson: {
          lastFlow: { date: today(), flow: min - 3 },
          forecastDays: [
            { date: dayOffset(1), flow: min - 1, flowLow: min - 3, flowHigh: min + 1 },
            { date: dayOffset(2), flow: min + 5, flowLow: min + 2, flowHigh: min + 8 },
            { date: dayOffset(3), flow: ideal, flowLow: min + 5, flowHigh: ideal + 5 },
          ],
        },
        hourlyJson: makeHourly(min - 3, "rising"),
        weatherJson: makeWeather(12),
        previousSnapshot: makeSnapshot({
          currentFlow: min - 5,
          paddlingStatus: "too-low",
          runnableWindowDays: 0,
          forecastEntersRange: false,
        }),
      };

    // ---- rain-bump: >15mm precip expected, was ≤15mm ----
    case "rain-bump":
      return {
        forecastJson: {
          lastFlow: { date: today(), flow: min - 2 },
          forecastDays: [
            { date: dayOffset(1), flow: min - 1, flowLow: min - 3, flowHigh: min + 2 },
            { date: dayOffset(2), flow: min + 3, flowLow: min, flowHigh: min + 6 },
          ],
        },
        hourlyJson: makeHourly(min - 2, "stable"),
        weatherJson: makeWeather(30),
        previousSnapshot: makeSnapshot({
          currentFlow: min - 2,
          paddlingStatus: "too-low",
          precipNext48h: 5,
        }),
      };

    // ---- confidence-upgraded: medium → high ----
    case "confidence-upgraded":
      return {
        forecastJson: {
          lastFlow: { date: today(), flow: min + 5 },
          forecastDays: [
            { date: dayOffset(1), flow: min + 6, flowLow: min + 5, flowHigh: min + 7 },
            { date: dayOffset(2), flow: min + 7, flowLow: min + 6, flowHigh: min + 8 },
            { date: dayOffset(3), flow: ideal, flowLow: ideal - 1, flowHigh: ideal + 1 },
          ],
        },
        hourlyJson: makeHourly(min + 5, "stable"),
        weatherJson: makeWeather(4),
        previousSnapshot: makeSnapshot({
          currentFlow: min + 5,
          paddlingStatus: "runnable",
          confidenceLevel: "medium",
        }),
      };

    // ---- rising-into-range: too-low, rising, flow > 80% of min ----
    case "rising-into-range":
      return {
        forecastJson: {
          lastFlow: { date: today(), flow: min * 0.85 },
          forecastDays: [
            { date: dayOffset(1), flow: min + 2, flowLow: min - 1, flowHigh: min + 5 },
            { date: dayOffset(2), flow: min + 5, flowLow: min + 2, flowHigh: min + 8 },
          ],
        },
        hourlyJson: makeHourly(min * 0.85, "rising"),
        weatherJson: makeWeather(10),
        previousSnapshot: makeSnapshot({
          currentFlow: min * 0.7,
          paddlingStatus: "too-low",
          trendDirection: "stable",
        }),
      };

    // ---- window-extended: runnable window grew by ≥1 day ----
    case "window-extended":
      return {
        forecastJson: {
          lastFlow: { date: today(), flow: min + 5 },
          forecastDays: [
            { date: dayOffset(1), flow: min + 6, flowLow: min + 3, flowHigh: min + 9 },
            { date: dayOffset(2), flow: ideal, flowLow: min + 5, flowHigh: ideal + 5 },
            { date: dayOffset(3), flow: ideal + 2, flowLow: ideal - 2, flowHigh: ideal + 6 },
            { date: dayOffset(4), flow: ideal, flowLow: min + 5, flowHigh: ideal + 5 },
          ],
        },
        hourlyJson: makeHourly(min + 5, "stable"),
        weatherJson: makeWeather(8),
        previousSnapshot: makeSnapshot({
          currentFlow: min + 3,
          paddlingStatus: "runnable",
          runnableWindowDays: 2,
        }),
      };

    // ---- window-shortened: runnable window shrank ----
    case "window-shortened":
      return {
        forecastJson: {
          lastFlow: { date: today(), flow: min + 5 },
          forecastDays: [
            { date: dayOffset(1), flow: min + 3, flowLow: min, flowHigh: min + 6 },
            { date: dayOffset(2), flow: min - 2, flowLow: min - 5, flowHigh: min + 1 },
          ],
        },
        hourlyJson: makeHourly(min + 5, "falling"),
        weatherJson: makeWeather(3),
        previousSnapshot: makeSnapshot({
          currentFlow: min + 8,
          paddlingStatus: "runnable",
          runnableWindowDays: 5,
        }),
      };

    // ---- season-opener / river-is-back / spring-melt / nearby / weekend-forecast ----
    // These cannot be triggered via data injection alone.
    // Use "direct-send" action instead.
    default:
      return {
        forecastJson: {
          lastFlow: { date: today(), flow: min + 5 },
          forecastDays: [
            { date: dayOffset(1), flow: min + 6, flowLow: min + 3, flowHigh: min + 9 },
          ],
        },
        hourlyJson: makeHourly(min + 5, "stable"),
        weatherJson: makeWeather(5),
        previousSnapshot: makeSnapshot({}),
      };
  }
}

// ---------------------------------------------------------------------------
// Direct email send (for types that can't be triggered via data injection)
// ---------------------------------------------------------------------------

async function sendDirectEmail(
  email: string,
  alertType: string,
  stationName: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from =
    process.env.NOTIFICATION_FROM_EMAIL ??
    "Kayak Rivière aux Sables <pierre@leduc.tech";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

  const EMOJI: Record<string, string> = {
    "its-on": "\uD83D\uDFE2", "last-call": "\u23F0", "safety-warning": "\uD83D\uDD34",
    "runnable-in-n-days": "\uD83D\uDCC5", "rain-bump": "\uD83C\uDF27\uFE0F",
    "confidence-upgraded": "\u2705", "rising-into-range": "\uD83D\uDCC8",
    "window-extended": "\u2795", "window-shortened": "\u2796",
    "dropping-out": "\uD83D\uDCC9", "season-opener": "\uD83C\uDF89",
    "river-is-back": "\uD83D\uDCA7", "nearby-alternative": "\uD83D\uDD04",
    "spring-melt-update": "\uD83C\uDF0A", "weekend-forecast": "\uD83D\uDCC6",
  };

  const MESSAGES: Record<string, string> = {
    "its-on": `${stationName} is now in runnable range at 15.0 m\u00b3/s. Time to paddle!`,
    "safety-warning": `${stationName} has exceeded safe levels at 45.0 m\u00b3/s. Exercise extreme caution.`,
    "last-call": `${stationName} is still runnable but expected to leave range in ~10 hours. Last chance!`,
    "dropping-out": `${stationName} is expected to drop out of range in ~20 hours.`,
    "runnable-in-n-days": `${stationName} is predicted to become runnable in 2 days.`,
    "rain-bump": `30mm of rain expected in the next 48 hours for ${stationName}. Flow may rise significantly.`,
    "confidence-upgraded": `Forecast confidence for ${stationName} has been upgraded to high.`,
    "rising-into-range": `${stationName} is rising (8.5 m\u00b3/s) and approaching runnable range (10.0 m\u00b3/s).`,
    "window-extended": `Good news! The runnable window for ${stationName} has extended to 5 days.`,
    "window-shortened": `The runnable window for ${stationName} has shortened to 1 day.`,
    "season-opener": `${stationName} is runnable for the first time this season! The wait is over.`,
    "spring-melt-update": `Spring melt conditions are developing for ${stationName}. Expect rising flows in the coming days.`,
    "river-is-back": `${stationName} is runnable again after a long dry spell! Don't miss it.`,
    "nearby-alternative": `${stationName} isn't runnable, but a nearby river might be. Check the app for alternatives.`,
    "weekend-forecast": `Your weekend river forecast is ready. Check ${stationName} and your other subscribed rivers.`,
  };

  const PREFIX: Record<string, string> = {
    "its-on": "Go paddle!", "last-call": "Last call", "safety-warning": "Safety warning",
    "runnable-in-n-days": "Coming soon", "rain-bump": "Rain incoming",
    "confidence-upgraded": "Forecast confirmed", "rising-into-range": "Rising into range",
    "window-extended": "Window extended", "window-shortened": "Window shortened",
    "dropping-out": "Dropping out", "season-opener": "Season opener!",
    "spring-melt-update": "Spring melt update", "river-is-back": "River is back!",
    "nearby-alternative": "Try another river", "weekend-forecast": "Weekend forecast",
  };

  const emoji = EMOJI[alertType] ?? "\uD83D\uDCE2";
  const prefix = PREFIX[alertType] ?? "Alert";
  const message = MESSAGES[alertType] ?? `Test notification for ${alertType}`;
  const subject = `${emoji} ${prefix} \u2014 ${stationName} [TEST]`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;border:1px solid #e4e4e7;">
<div style="background:#2D8FCC;padding:20px 24px;"><h1 style="margin:0;color:#fff;font-size:20px;">Kayak Rivi&egrave;re aux Sables</h1></div>
<div style="padding:24px;">
<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:8px 12px;margin-bottom:16px;font-size:13px;color:#92400e;">TEST NOTIFICATION &mdash; Sent from admin panel</div>
<h2 style="margin:0 0 16px;font-size:18px;">${emoji} ${stationName}</h2>
<p style="color:#18181b;font-size:16px;line-height:1.6;">${message}</p>
<p style="color:#52525b;">Current flow: <strong>15.0 m&sup3;/s</strong></p>
<div style="margin:24px 0;">
<a href="${appUrl}" style="display:inline-block;padding:10px 20px;background:#2D8FCC;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">View River</a>
</div></div>
<div style="padding:16px 24px;border-top:1px solid #e4e4e7;background:#fafafa;font-size:13px;color:#71717a;">
Sent via admin test panel</div></div></body></html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: email, subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// GET — Status
// ---------------------------------------------------------------------------

export async function GET() {
  // Check test station exists
  const stations = (await sql(
    `SELECT id, name, status FROM stations WHERE id = $1`,
    [TEST_STATION_ID],
  )) as Array<{ id: string; name: string; status: string }>;

  // Get subscribers for test station
  const subscribers = (await sql(
    `SELECT s.id, s.email, sub.active, sub.id as subscription_id
     FROM subscribers s
     JOIN subscriptions sub ON sub.subscriber_id = s.id
     WHERE sub.station_id = $1 AND s.confirmed = true`,
    [TEST_STATION_ID],
  )) as Array<{ id: string; email: string; active: boolean; subscription_id: string }>;

  // Recent notification logs for test station
  const logs = (await sql(
    `SELECT nl.id, nl.alert_type, nl.priority, nl.subject, nl.sent_at, nl.delivered, s.email
     FROM notification_log nl
     JOIN subscribers s ON s.id = nl.subscriber_id
     WHERE nl.station_id = $1
     ORDER BY nl.created_at DESC
     LIMIT 30`,
    [TEST_STATION_ID],
  )) as Array<{
    id: string;
    alert_type: string;
    priority: string;
    subject: string;
    sent_at: string | null;
    delivered: boolean;
    email: string;
  }>;

  // Current alert states for test subscriptions
  const alertStates = (await sql(
    `SELECT als.alert_type, als.state, als.last_triggered
     FROM alert_state als
     JOIN subscriptions sub ON sub.id = als.subscription_id
     WHERE sub.station_id = $1`,
    [TEST_STATION_ID],
  )) as Array<{ alert_type: string; state: string; last_triggered: string | null }>;

  // Current snapshot
  const snapshots = (await sql(
    `SELECT snapshot_json FROM alert_snapshots WHERE station_id = $1`,
    [TEST_STATION_ID],
  )) as Array<{ snapshot_json: unknown }>;

  return Response.json({
    testStation: stations[0] ?? null,
    subscribers,
    recentLogs: logs,
    alertStates,
    currentSnapshot: snapshots[0]?.snapshot_json ?? null,
  });
}

// ---------------------------------------------------------------------------
// POST — Actions
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    action: string;
    email?: string;
    alertType?: string;
  };

  const { action } = body;

  // ---- Setup test river + subscriber ----
  if (action === "setup") {
    const email = body.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Valid email required" }, { status: 400 });
    }

    // Create test station
    await sql(
      `INSERT INTO stations (id, station_number, name, lat, lon, paddling_min, paddling_ideal, paddling_max, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'test')
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         paddling_min = EXCLUDED.paddling_min,
         paddling_ideal = EXCLUDED.paddling_ideal,
         paddling_max = EXCLUDED.paddling_max,
         status = 'test',
         updated_at = now()`,
      [
        TEST_STATION.id, TEST_STATION.stationNumber, TEST_STATION.name,
        TEST_STATION.lat, TEST_STATION.lon,
        TEST_STATION.paddlingMin, TEST_STATION.paddlingIdeal, TEST_STATION.paddlingMax,
      ],
    );

    // Deactivate all existing subscriptions for the test station
    await sql(
      `UPDATE subscriptions SET active = false
       WHERE station_id = $1`,
      [TEST_STATION_ID],
    );

    // Also clean up alert_state for deactivated subscriptions
    await sql(
      `DELETE FROM alert_state WHERE subscription_id IN (
        SELECT id FROM subscriptions WHERE station_id = $1 AND active = false
      )`,
      [TEST_STATION_ID],
    );

    // Create subscriber (auto-confirmed)
    const subscribers = (await sql(
      `INSERT INTO subscribers (email, confirmed, confirmed_at)
       VALUES ($1, true, now())
       ON CONFLICT (email) DO UPDATE SET
         confirmed = true,
         confirmed_at = COALESCE(subscribers.confirmed_at, now()),
         updated_at = now()
       RETURNING id, token`,
      [email],
    )) as Array<{ id: string; token: string }>;

    // Create subscription (only one active at a time)
    await sql(
      `INSERT INTO subscriptions (subscriber_id, station_id, active)
       VALUES ($1, $2, true)
       ON CONFLICT (subscriber_id, station_id) DO UPDATE SET active = true`,
      [subscribers[0].id, TEST_STATION_ID],
    );

    // Initialize empty forecast cache
    await sql(
      `INSERT INTO forecast_cache (station_id, forecast_json, hourly_json, weather_json, generated_at)
       VALUES ($1, $2, '[]'::jsonb, '[]'::jsonb, now())
       ON CONFLICT (station_id) DO UPDATE SET
         forecast_json = EXCLUDED.forecast_json,
         hourly_json = EXCLUDED.hourly_json,
         weather_json = EXCLUDED.weather_json,
         generated_at = now()`,
      [TEST_STATION_ID, JSON.stringify({ lastFlow: null, forecastDays: [] })],
    );

    return Response.json({
      success: true,
      subscriberId: subscribers[0].id,
      token: subscribers[0].token,
    });
  }

  // ---- Schedule a notification scenario ----
  if (action === "schedule") {
    const { alertType } = body;
    if (!alertType) {
      return Response.json({ error: "alertType required" }, { status: 400 });
    }

    // Types that can't be triggered via data injection
    const directOnlyTypes = [
      "season-opener", "spring-melt-update", "river-is-back",
      "nearby-alternative", "weekend-forecast",
    ];

    if (directOnlyTypes.includes(alertType)) {
      return Response.json({
        error: `"${alertType}" cannot be triggered via data injection. Use "direct-send" instead.`,
        directOnly: true,
      }, { status: 400 });
    }

    // Check test station exists
    const stations = await sql(
      `SELECT id FROM stations WHERE id = $1`,
      [TEST_STATION_ID],
    );
    if (stations.length === 0) {
      return Response.json({ error: "Test river not set up. Run setup first." }, { status: 400 });
    }

    // Check there's at least one subscriber
    const subs = await sql(
      `SELECT sub.id FROM subscriptions sub
       JOIN subscribers s ON s.id = sub.subscriber_id
       WHERE sub.station_id = $1 AND sub.active = true AND s.confirmed = true`,
      [TEST_STATION_ID],
    );
    if (subs.length === 0) {
      return Response.json({ error: "No subscribers for test river. Run setup first." }, { status: 400 });
    }

    // Build scenario data
    const scenario = buildScenario(alertType);

    // 1. Write forecast_cache
    await sql(
      `INSERT INTO forecast_cache (station_id, forecast_json, hourly_json, weather_json, generated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (station_id) DO UPDATE SET
         forecast_json = EXCLUDED.forecast_json,
         hourly_json = EXCLUDED.hourly_json,
         weather_json = EXCLUDED.weather_json,
         generated_at = now()`,
      [
        TEST_STATION_ID,
        JSON.stringify(scenario.forecastJson),
        JSON.stringify(scenario.hourlyJson),
        JSON.stringify(scenario.weatherJson),
      ],
    );

    // 2. Write previous snapshot to alert_snapshots
    await sql(
      `INSERT INTO alert_snapshots (station_id, snapshot_json, evaluated_at)
       VALUES ($1, $2, now() - interval '15 minutes')
       ON CONFLICT (station_id) DO UPDATE SET
         snapshot_json = EXCLUDED.snapshot_json,
         evaluated_at = now() - interval '15 minutes'`,
      [TEST_STATION_ID, JSON.stringify(scenario.previousSnapshot)],
    );

    // 3. Clear cooldowns for all test subscriptions
    await sql(
      `DELETE FROM alert_state WHERE subscription_id IN (
        SELECT id FROM subscriptions WHERE station_id = $1
      )`,
      [TEST_STATION_ID],
    );

    // 4. Trigger evaluate-alerts
    let triggerResult: { id?: string; error?: string } = {};
    try {
      const handle = await tasks.trigger("evaluate-alerts", {
        triggeredBy: `admin-test:${alertType}`,
      });
      triggerResult = { id: handle.id };
    } catch (err) {
      triggerResult = {
        error: err instanceof Error ? err.message : String(err),
      };
    }

    return Response.json({
      success: true,
      alertType,
      scenarioInjected: true,
      triggerResult,
    });
  }

  // ---- Direct send (for types that can't be triggered via injection) ----
  if (action === "direct-send") {
    const { alertType, email } = body;
    if (!alertType || !email) {
      return Response.json({ error: "alertType and email required" }, { status: 400 });
    }

    const sent = await sendDirectEmail(email, alertType, TEST_STATION.name);

    // Log it
    const subscribers = (await sql(
      `SELECT id FROM subscribers WHERE email = $1`,
      [email.trim().toLowerCase()],
    )) as Array<{ id: string }>;

    if (subscribers.length > 0) {
      await sql(
        `INSERT INTO notification_log (subscriber_id, station_id, alert_type, priority, subject, sent_at, delivered)
         VALUES ($1, $2, $3, 'normal', $4, $5, $6)`,
        [
          subscribers[0].id,
          TEST_STATION_ID,
          alertType,
          `[TEST] ${alertType}: ${TEST_STATION.name}`,
          sent ? new Date().toISOString() : null,
          sent,
        ],
      );
    }

    return Response.json({ success: sent, alertType, directSend: true });
  }

  // ---- Reset cooldowns ----
  if (action === "reset-cooldowns") {
    await sql(
      `DELETE FROM alert_state WHERE subscription_id IN (
        SELECT id FROM subscriptions WHERE station_id = $1
      )`,
      [TEST_STATION_ID],
    );
    return Response.json({ success: true });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
