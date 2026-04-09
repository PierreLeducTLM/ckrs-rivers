/**
 * Email HTML templates for notification system.
 * Plain HTML strings — no template library needed.
 */

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function layout(title: string, body: string, unsubscribeUrl?: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <div style="background:#0f172a;padding:20px 24px;">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">WaterFlow</h1>
    </div>
    <div style="padding:24px;">
      <h2 style="margin:0 0 16px;font-size:18px;color:#18181b;">${title}</h2>
      ${body}
    </div>
    <div style="padding:16px 24px;border-top:1px solid #e4e4e7;background:#fafafa;font-size:13px;color:#71717a;">
      ${unsubscribeUrl ? `<a href="${unsubscribeUrl}" style="color:#71717a;">Unsubscribe</a> &middot; ` : ""}
      <a href="${appUrl()}" style="color:#71717a;">WaterFlow</a>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Confirmation email
// ---------------------------------------------------------------------------

export function confirmationEmail(
  token: string,
  stationNames: string[],
): { subject: string; html: string } {
  const confirmUrl = `${appUrl()}/api/notifications/confirm?token=${token}`;
  const stations = stationNames.length > 0
    ? `<p style="color:#52525b;">You'll receive alerts for: <strong>${stationNames.join(", ")}</strong></p>`
    : "";

  return {
    subject: "Confirm your WaterFlow notifications",
    html: layout(
      "Confirm your email",
      `<p style="color:#52525b;line-height:1.6;">Click the button below to start receiving river flow notifications.</p>
       ${stations}
       <div style="margin:24px 0;">
         <a href="${confirmUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
           Confirm &amp; Subscribe
         </a>
       </div>
       <p style="font-size:13px;color:#a1a1aa;">If you didn't sign up for WaterFlow, you can ignore this email.</p>`,
    ),
  };
}

// ---------------------------------------------------------------------------
// Alert email (single notification)
// ---------------------------------------------------------------------------

interface AlertEmailParams {
  stationName: string;
  alertType: string;
  currentFlow: number | null;
  message: string;
  manageToken: string;
  context?: Record<string, unknown>;
}

const ALERT_EMOJI: Record<string, string> = {
  "its-on": "🟢",
  "last-call": "⏰",
  "safety-warning": "🔴",
  "runnable-in-n-days": "📅",
  "rain-bump": "🌧️",
  "confidence-upgraded": "✅",
  "rising-into-range": "📈",
  "window-extended": "➕",
  "window-shortened": "➖",
  "dropping-out": "📉",
  "season-opener": "🎉",
  "spring-melt-update": "❄️",
  "river-is-back": "💧",
  "nearby-alternative": "🔄",
};

const ALERT_SUBJECT_PREFIX: Record<string, string> = {
  "its-on": "Go paddle!",
  "last-call": "Last call",
  "safety-warning": "Safety warning",
  "runnable-in-n-days": "Coming soon",
  "rain-bump": "Rain incoming",
  "confidence-upgraded": "Forecast confirmed",
  "rising-into-range": "Rising into range",
  "window-extended": "Window extended",
  "window-shortened": "Window shortened",
  "dropping-out": "Dropping out",
  "season-opener": "Season opener!",
  "spring-melt-update": "Spring melt update",
  "river-is-back": "River is back!",
  "nearby-alternative": "Try another river",
};

export function alertEmail(params: AlertEmailParams): { subject: string; html: string } {
  const { stationName, alertType, currentFlow, message, manageToken } = params;
  const emoji = ALERT_EMOJI[alertType] ?? "📢";
  const prefix = ALERT_SUBJECT_PREFIX[alertType] ?? "Alert";
  const unsubscribeUrl = `${appUrl()}/api/notifications/unsubscribe?token=${manageToken}`;
  const manageUrl = `${appUrl()}/notifications?token=${manageToken}`;

  const flowLine = currentFlow != null
    ? `<p style="color:#52525b;">Current flow: <strong>${currentFlow.toFixed(1)} m&sup3;/s</strong></p>`
    : "";

  return {
    subject: `${emoji} ${prefix} — ${stationName}`,
    html: layout(
      `${emoji} ${stationName}`,
      `<p style="color:#18181b;font-size:16px;line-height:1.6;">${message}</p>
       ${flowLine}
       <div style="margin:24px 0;">
         <a href="${appUrl()}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
           View River
         </a>
         <a href="${manageUrl}" style="display:inline-block;padding:10px 20px;margin-left:8px;background:#f4f4f5;color:#52525b;text-decoration:none;border-radius:8px;">
           Manage Alerts
         </a>
       </div>`,
      unsubscribeUrl,
    ),
  };
}

// ---------------------------------------------------------------------------
// Digest email (weekly summary)
// ---------------------------------------------------------------------------

interface DigestStation {
  name: string;
  status: string;
  currentFlow: number | null;
  forecastSummary: string;
}

export function digestEmail(
  manageToken: string,
  stations: DigestStation[],
  period: string,
): { subject: string; html: string } {
  const unsubscribeUrl = `${appUrl()}/api/notifications/unsubscribe?token=${manageToken}`;

  const STATUS_DOT: Record<string, string> = {
    "ideal": "🟢",
    "runnable": "🟡",
    "too-low": "⚪",
    "too-high": "🔴",
    "unknown": "⚫",
  };

  const rows = stations.map((s) => {
    const dot = STATUS_DOT[s.status] ?? "⚫";
    const flow = s.currentFlow != null ? `${s.currentFlow.toFixed(1)} m&sup3;/s` : "N/A";
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f5;">${dot} ${s.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f5;">${flow}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f5;color:#71717a;font-size:13px;">${s.forecastSummary}</td>
    </tr>`;
  }).join("");

  return {
    subject: `WaterFlow — ${period} forecast digest`,
    html: layout(
      `${period} River Forecast`,
      `<table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="text-align:left;">
            <th style="padding:8px 12px;border-bottom:2px solid #e4e4e7;">River</th>
            <th style="padding:8px 12px;border-bottom:2px solid #e4e4e7;">Flow</th>
            <th style="padding:8px 12px;border-bottom:2px solid #e4e4e7;">Forecast</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:20px;">
        <a href="${appUrl()}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
          View All Rivers
        </a>
      </div>`,
      unsubscribeUrl,
    ),
  };
}
