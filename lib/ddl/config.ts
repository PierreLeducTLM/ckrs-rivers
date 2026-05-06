/**
 * Static configuration for deep linking and store fallbacks.
 *
 * Override via environment variables when needed. The defaults work for the
 * production FlowCast app on Android; the iOS App Store URL falls back to a
 * Smart App Banner-style search by bundle id when no numeric id is configured,
 * which still gets users to the right product page.
 */

export const ANDROID_PACKAGE = "com.flowcast.paddle.app";
export const IOS_BUNDLE_ID = "com.flowcast.paddle.app";
export const APP_HOST = "www.flowcast.ca";
export const CUSTOM_SCHEME = "flowcast";

export function getPlayStoreUrl(referrer?: string): string {
  const base =
    process.env.NEXT_PUBLIC_PLAY_STORE_URL ??
    `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
  if (!referrer) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}referrer=${encodeURIComponent(referrer)}`;
}

/**
 * Numeric Apple App Store id (CFBundleIdentifier maps to a numeric trackId).
 * Used for the apple-itunes-app smart banner and for App Store fallback URLs.
 * Ship-time TODO: fill this in once the App Store listing is published.
 */
export const IOS_APP_STORE_ID = process.env.NEXT_PUBLIC_IOS_APP_STORE_ID ?? "";

export function getAppStoreUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_STORE_URL) {
    return process.env.NEXT_PUBLIC_APP_STORE_URL;
  }
  if (IOS_APP_STORE_ID) {
    return `https://apps.apple.com/app/id${IOS_APP_STORE_ID}`;
  }
  // Fallback: search for the app by name. Not ideal, but gets users somewhere
  // sensible until the numeric id is wired in.
  return "https://apps.apple.com/ca/app/flowcast/id0";
}
