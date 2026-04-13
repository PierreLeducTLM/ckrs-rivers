import { logger, schedules } from "@trigger.dev/sdk/v3";
import { neon } from "@neondatabase/serverless";

/**
 * Send weekly digest emails on Wednesday, Thursday and Friday at 6 PM ET.
 * Includes weekend forecast for all subscribed rivers.
 *
 * Inlines all logic (no @/ aliases) per Trigger.dev bundling constraints.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlFn = (query: string, params?: any[]) => Promise<any[]>;

function createSql(): SqlFn {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const neonSql = neon(process.env.DATABASE_URL);
  return (query, params) => neonSql.query(query, params ?? []);
}

// ---------------------------------------------------------------------------
// Inline paddling status
// ---------------------------------------------------------------------------

function getPaddlingStatus(
  flow: number | null | undefined,
  min?: number,
  ideal?: number,
  max?: number,
): string {
  if (flow == null) return "unknown";
  if (min == null && ideal == null && max == null) return "unknown";
  if (min != null && flow < min) return "too-low";
  if (max != null && flow > max) return "too-high";
  if (ideal != null && flow >= ideal) return "ideal";
  return "runnable";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubscriberDigest {
  subscriberId: string;
  email: string;
  token: string;
  stations: Array<{
    name: string;
    status: string;
    currentFlow: number | null;
    forecastSummary: string;
  }>;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

async function sendDigestEmail(digest: SubscriberDigest, period: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from = process.env.NOTIFICATION_FROM_EMAIL ?? "FlowCast <pierre@leduc.tech>";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  const unsubUrl = `${appUrl}/api/notifications/unsubscribe?token=${digest.token}`;

  const DOT: Record<string, string> = {
    ideal: "\uD83D\uDFE2", runnable: "\uD83D\uDFE1", "too-low": "\u26AA",
    "too-high": "\uD83D\uDD34", unknown: "\u26AB",
  };

  const rows = digest.stations.map((s) => {
    const dot = DOT[s.status] ?? "\u26AB";
    const flow = s.currentFlow != null ? `${s.currentFlow.toFixed(1)} m&sup3;/s` : "N/A";
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f5;">${dot} ${s.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f5;">${flow}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f5;color:#71717a;font-size:13px;">${s.forecastSummary}</td>
    </tr>`;
  }).join("");

  const subject = `FlowCast \u2014 ${period} forecast digest`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;border:1px solid #e4e4e7;">
<div style="background:#2D8FCC;padding:20px 24px;"><h1 style="margin:0;color:#fff;font-size:20px;">FlowCast</h1></div>
<div style="padding:24px;">
<h2 style="margin:0 0 16px;font-size:18px;">${period} River Forecast</h2>
<table style="width:100%;border-collapse:collapse;font-size:14px;">
<thead><tr style="text-align:left;">
<th style="padding:8px 12px;border-bottom:2px solid #e4e4e7;">River</th>
<th style="padding:8px 12px;border-bottom:2px solid #e4e4e7;">Flow</th>
<th style="padding:8px 12px;border-bottom:2px solid #e4e4e7;">Forecast</th>
</tr></thead>
<tbody>${rows}</tbody></table>
<div style="margin-top:20px;">
<a href="${appUrl}" style="display:inline-block;padding:10px 20px;background:#2D8FCC;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">View All Rivers</a>
</div></div>
<div style="padding:16px 24px;border-top:1px solid #e4e4e7;background:#fafafa;font-size:13px;color:#71717a;">
<a href="${unsubUrl}" style="color:#71717a;">Unsubscribe</a></div></div></body></html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: digest.email, subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Scheduled task: Wednesday, Thursday & Friday 6 PM ET (22:00 UTC in summer)
// ---------------------------------------------------------------------------

export const sendDigest = schedules.task({
  id: "send-digest",
  cron: "0 18 * * 3,4,5",
  maxDuration: 120,
  run: async () => {
    const dbSql = createSql();
    const now = new Date();
    const dayOfWeek = now.getDay(); // 3=Wed, 4=Thu, 5=Fri
    const period = dayOfWeek === 5 ? "Weekend (final)" : dayOfWeek === 4 ? "Weekend (updated)" : "Weekend";

    logger.info(`Sending ${period} digest`);

    // Get all confirmed subscribers with active subscriptions
    const subscribers = (await dbSql(
      `SELECT DISTINCT s.id as subscriber_id, s.email, s.token
       FROM subscribers s
       JOIN subscriptions sub ON sub.subscriber_id = s.id
       WHERE s.confirmed = true AND sub.active = true`,
    )) as Array<{ subscriber_id: string; email: string; token: string }>;

    logger.info(`${subscribers.length} subscribers to send digests to`);

    let sentCount = 0;

    for (const sub of subscribers) {
      // Get all subscribed stations with their current data
      const stationData = (await dbSql(
        `SELECT st.id, st.name, st.paddling_min, st.paddling_ideal, st.paddling_max,
                (fc.forecast_json->'lastFlow'->>'flow')::double precision as current_flow,
                fc.forecast_json->'forecastDays' as forecast_days
         FROM subscriptions s
         JOIN stations st ON st.id = s.station_id
         LEFT JOIN forecast_cache fc ON fc.station_id = st.id
         WHERE s.subscriber_id = $1 AND s.active = true
         ORDER BY st.name`,
        [sub.subscriber_id],
      )) as Array<{
        id: string;
        name: string;
        paddling_min: number | null;
        paddling_ideal: number | null;
        paddling_max: number | null;
        current_flow: number | null;
        forecast_days: Array<{ date: string; flow: number }> | null;
      }>;

      if (stationData.length === 0) continue;

      const digestStations = stationData.map((st) => {
        const status = getPaddlingStatus(
          st.current_flow,
          st.paddling_min ?? undefined,
          st.paddling_ideal ?? undefined,
          st.paddling_max ?? undefined,
        );

        // Build forecast summary from next 3 days
        const days = (st.forecast_days ?? []).slice(0, 3);
        let forecastSummary = "No forecast";
        if (days.length > 0) {
          const flows = days.map((d) => d.flow.toFixed(1));
          const statuses = days.map((d) =>
            getPaddlingStatus(d.flow, st.paddling_min ?? undefined, st.paddling_ideal ?? undefined, st.paddling_max ?? undefined),
          );
          const willBeRunnable = statuses.some((s) => s === "runnable" || s === "ideal");
          forecastSummary = willBeRunnable
            ? `Runnable! (${flows.join(" \u2192 ")} m\u00b3/s)`
            : `${flows.join(" \u2192 ")} m\u00b3/s`;
        }

        return {
          name: st.name,
          status,
          currentFlow: st.current_flow,
          forecastSummary,
        };
      });

      const digest: SubscriberDigest = {
        subscriberId: sub.subscriber_id,
        email: sub.email,
        token: sub.token,
        stations: digestStations,
      };

      const sent = await sendDigestEmail(digest, period);

      // Log
      await dbSql(
        `INSERT INTO notification_log (subscriber_id, alert_type, priority, subject, sent_at, delivered)
         VALUES ($1, 'weekend-forecast', 'normal', $2, $3, $4)`,
        [
          sub.subscriber_id,
          `Weekend forecast digest`,
          sent ? now.toISOString() : null,
          sent,
        ],
      );

      if (sent) sentCount++;
    }

    logger.info(`Digest complete: ${sentCount}/${subscribers.length} emails sent`);

    return { total: subscribers.length, sent: sentCount };
  },
});
