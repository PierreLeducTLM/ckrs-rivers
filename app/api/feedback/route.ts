import { NextRequest } from "next/server";

import { sql } from "@/lib/db/client";
import { sendEmail } from "@/lib/notifications/send-email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ALLOWED_KINDS = ["general", "river_config"] as const;
type FeedbackKind = (typeof ALLOWED_KINDS)[number];

const ALLOWED_FIELDS = [
  "paddling_levels",
  "put_in_take_out",
  "river_path",
  "rapid_class",
  "description",
  "coordinates",
  "other",
] as const;
type FeedbackField = (typeof ALLOWED_FIELDS)[number];

const FIELD_LABEL_EN: Record<FeedbackField, string> = {
  paddling_levels: "Paddling levels (min / ideal / max)",
  put_in_take_out: "Put-in / Take-out",
  river_path: "River path",
  rapid_class: "Rapid class",
  description: "Description",
  coordinates: "Coordinates",
  other: "Something else",
};

const MAX_MESSAGE_LEN = 4000;
const MAX_NAME_LEN = 200;
const MAX_PAGE_URL_LEN = 1000;
const MAX_UA_LEN = 500;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface FeedbackBody {
  kind?: string;
  message?: string;
  stationId?: string;
  field?: string;
  fields?: unknown;
  name?: string;
  email?: string;
  pageUrl?: string;
}

/**
 * POST /api/feedback
 *
 * Stores feedback (general or river-config) in the `feedback` table and
 * fires a best-effort notification email to the administrator. Email
 * delivery failures never fail the request — the DB row is the source
 * of truth.
 */
export async function POST(request: NextRequest) {
  let body: FeedbackBody;
  try {
    body = (await request.json()) as FeedbackBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const kind = body.kind;
  if (!kind || !ALLOWED_KINDS.includes(kind as FeedbackKind)) {
    return Response.json({ error: "Invalid feedback kind" }, { status: 400 });
  }

  const message = body.message?.trim() ?? "";
  if (message.length === 0) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return Response.json({ error: "Message is too long" }, { status: 400 });
  }

  const stationId = body.stationId?.trim() || null;
  if (kind === "river_config" && !stationId) {
    return Response.json({ error: "stationId is required for river_config feedback" }, { status: 400 });
  }

  // Accept either `fields: string[]` (current client) or `field: string` (legacy
  // single-value form). Normalize to a deduped, validated list.
  const rawFields: string[] = [];
  if (Array.isArray(body.fields)) {
    for (const f of body.fields) {
      if (typeof f === "string") rawFields.push(f.trim());
    }
  } else if (typeof body.field === "string" && body.field.trim().length > 0) {
    rawFields.push(body.field.trim());
  }

  const selectedFields: FeedbackField[] = [];
  for (const f of rawFields) {
    if (f.length === 0) continue;
    if (!ALLOWED_FIELDS.includes(f as FeedbackField)) {
      return Response.json({ error: `Invalid field value: ${f}` }, { status: 400 });
    }
    if (!selectedFields.includes(f as FeedbackField)) {
      selectedFields.push(f as FeedbackField);
    }
  }
  const fieldStored: string | null = selectedFields.length > 0 ? selectedFields.join(",") : null;

  const name = body.name?.trim().slice(0, MAX_NAME_LEN) || null;

  const rawEmail = body.email?.trim().toLowerCase() ?? "";
  let email: string | null = null;
  if (rawEmail.length > 0) {
    if (!EMAIL_RE.test(rawEmail)) {
      return Response.json({ error: "Invalid email address" }, { status: 400 });
    }
    email = rawEmail;
  }

  const pageUrl = body.pageUrl?.trim().slice(0, MAX_PAGE_URL_LEN) || null;
  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, MAX_UA_LEN) || null;

  // Look up station name when applicable so the notification email is useful.
  let stationName: string | null = null;
  if (stationId) {
    try {
      const rows = (await sql(
        `SELECT name FROM stations WHERE id = $1 LIMIT 1`,
        [stationId],
      )) as Array<{ name: string }>;
      stationName = rows[0]?.name ?? null;
    } catch {
      // If lookup fails we still want to store the feedback — keep going.
    }
  }

  let id: string;
  try {
    const inserted = (await sql(
      `INSERT INTO feedback (kind, station_id, field, message, name, email, page_url, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [kind, stationId, fieldStored, message, name, email, pageUrl, userAgent],
    )) as Array<{ id: string }>;
    id = inserted[0].id;
  } catch (err) {
    console.error("Failed to insert feedback:", err);
    return Response.json({ error: "Failed to save feedback" }, { status: 500 });
  }

  // Best-effort admin notification — never blocks the response on failure.
  const recipient = process.env.FEEDBACK_NOTIFICATION_EMAIL ?? "pierre@leduc.tech";
  try {
    const subjectKind = kind === "river_config" ? "River config" : "General";
    const subjectStation = stationName
      ? `: ${stationName}`
      : stationId
        ? `: ${stationId}`
        : "";
    const subject = `[FlowCast Feedback] ${subjectKind}${subjectStation}`;

    const fieldsHtml =
      selectedFields.length > 0
        ? `<ul>${selectedFields
            .map((f) => `<li>${escapeHtml(FIELD_LABEL_EN[f])} <code>(${escapeHtml(f)})</code></li>`)
            .join("")}</ul>`
        : null;

    const lines: Array<[string, string | null]> = [
      ["Kind", kind],
      ["Station", stationId ? `${stationName ?? "?"} (${stationId})` : null],
      ["Name", name],
      ["Email", email],
      ["Page", pageUrl],
      ["User-Agent", userAgent],
    ];

    const meta = lines
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}</li>`)
      .join("");

    const html = `
      <h2>New FlowCast feedback</h2>
      <ul>${meta}</ul>
      ${fieldsHtml ? `<h3>Reported fields</h3>${fieldsHtml}` : ""}
      <h3>Message</h3>
      <pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(message)}</pre>
    `;

    console.log(
      `[feedback ${id}] sending notification email kind=${kind} station=${stationId ?? "-"} fields=${selectedFields.join("|") || "-"} to=${recipient}`,
    );
    const result = await sendEmail({ to: recipient, subject, html });
    if (result.success) {
      console.log(`[feedback ${id}] notification email sent (resend id=${result.id ?? "?"})`);
    } else {
      console.error(`[feedback ${id}] notification email failed:`, result.error);
    }
  } catch (err) {
    console.error(`[feedback ${id}] notification email threw:`, err);
  }

  return Response.json({ success: true, id });
}
