import { NextRequest } from "next/server";

import { getMobilePlatform, isInAppBrowser } from "@/lib/ddl/detect";
import { extractClientIp, registerClick } from "@/lib/ddl/click";
import {
  buildAppStoreFallback,
  buildCustomSchemeUrl,
  buildIntentUrl,
} from "@/lib/ddl/links";

interface RegisterBody {
  targetPath?: string;
}

const ALLOWED_PREFIXES = ["/rivers/", "/go/"];
const MAX_PATH_LEN = 1024;

function isAllowedPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.length > MAX_PATH_LEN) return false;
  return ALLOWED_PREFIXES.some((p) => path.startsWith(p));
}

/**
 * POST /api/ddl/register
 *
 * Called by the client-side bouncer when it detects a mobile in-app browser
 * pointing at a shareable FlowCast URL. We persist a click row keyed by
 * (UA hash, IP/24 hash, day) so we can recover the originally shared path on
 * first launch after install.
 *
 * Returns the URLs the bouncer needs to drive the user into either the app or
 * the relevant store.
 */
export async function POST(request: NextRequest) {
  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const targetPath = body.targetPath?.trim();
  if (!targetPath || !isAllowedPath(targetPath)) {
    return Response.json({ error: "Invalid targetPath" }, { status: 400 });
  }

  const ua = request.headers.get("user-agent");
  const platform = getMobilePlatform(ua);
  if (!platform) {
    return Response.json({ error: "Not a mobile platform" }, { status: 400 });
  }
  const iab = isInAppBrowser(ua);

  const ip = extractClientIp(request.headers);
  const { clickId } = await registerClick({
    targetPath,
    platform,
    ua,
    ip,
    iab,
  });

  return Response.json({
    clickId,
    intentUrl: buildIntentUrl(targetPath, clickId),
    customSchemeUrl: buildCustomSchemeUrl(targetPath),
    appStoreUrl: buildAppStoreFallback(),
  });
}
