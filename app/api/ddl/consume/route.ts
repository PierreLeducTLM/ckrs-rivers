import { NextRequest } from "next/server";

import { consumeClick, extractClientIp } from "@/lib/ddl/click";
import { getMobilePlatform } from "@/lib/ddl/detect";

interface ConsumeBody {
  clickId?: string;
}

/**
 * POST /api/ddl/consume
 *
 * Called by the FlowCast app on cold launch (Capacitor `CapacitorInit`).
 *
 *   - Android: passes `clickId` extracted from the Play Store install referrer.
 *   - iOS: omits `clickId` and relies on server-side fingerprint matching
 *     against the request IP/24 + normalised UA, scoped to a 24h window.
 *
 * Returns `{ targetPath }` if a pending DDL click is found, or 404 otherwise.
 */
export async function POST(request: NextRequest) {
  let body: ConsumeBody = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      body = JSON.parse(text) as ConsumeBody;
    }
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ua = request.headers.get("user-agent");
  const platform = getMobilePlatform(ua);
  if (!platform) {
    return Response.json({ error: "Not a mobile platform" }, { status: 400 });
  }

  const ip = extractClientIp(request.headers);
  const result = await consumeClick({
    clickId: body.clickId?.trim() || undefined,
    platform,
    ua,
    ip,
  });

  if (!result) {
    return Response.json({ error: "No pending click" }, { status: 404 });
  }
  return Response.json({ targetPath: result.targetPath });
}
