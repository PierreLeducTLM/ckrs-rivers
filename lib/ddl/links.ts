/**
 * Helpers for building the URLs the bouncer hands to mobile in-app browsers.
 *
 *   - Android: an `intent://` URL with an embedded Play Store fallback. The
 *     Play Store fallback URL also carries a `referrer` so Google's Install
 *     Referrer API surfaces our `clickId` to the app on first launch.
 *   - iOS: a `flowcast://` custom-scheme URL plus a separate App Store URL
 *     used as a timer-based fallback in the bouncer component.
 */

import {
  ANDROID_PACKAGE,
  APP_HOST,
  CUSTOM_SCHEME,
  getAppStoreUrl,
  getPlayStoreUrl,
} from "@/lib/ddl/config";

/** Turn an absolute path like "/rivers/abc?x=1" into the canonical https URL
 * the Android intent URL points at. Belt-and-braces validation: callers
 * already validate, but defending here is cheap. */
function safePath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  return path;
}

export function buildIntentUrl(targetPath: string, clickId: string): string {
  const path = safePath(targetPath);
  const fallback = getPlayStoreUrl(`ddl_clickid=${clickId}`);
  // Intent URL components are semicolon-separated and individually URL-encoded
  // for the keys and values in `S.browser_fallback_url`.
  return [
    `intent://${APP_HOST}${path}`,
    `#Intent`,
    `scheme=https`,
    `package=${ANDROID_PACKAGE}`,
    `S.browser_fallback_url=${encodeURIComponent(fallback)}`,
    `end`,
  ].join(";");
}

export function buildCustomSchemeUrl(targetPath: string): string {
  const path = safePath(targetPath);
  return `${CUSTOM_SCHEME}://${APP_HOST}${path}`;
}

export function buildAppStoreFallback(): string {
  return getAppStoreUrl();
}
