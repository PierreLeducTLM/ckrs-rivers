/**
 * User-agent detection for the deferred-deep-link bouncer.
 *
 * The bouncer only fires inside *mobile* in-app browsers (Messenger, Instagram,
 * Facebook, ...). Plain mobile Safari/Chrome and any desktop browser are
 * intentionally not matched — they'll see the normal river / point page and,
 * if the FlowCast app is installed, the OS handles routing via App Links /
 * Universal Links.
 */

export type IabKind = "fb" | "ig" | "messenger" | "tiktok" | "linkedin";

const IAB_PATTERNS: Array<{ kind: IabKind; re: RegExp }> = [
  // Facebook in-app browser variants. FBAN/FBAV cover the FB iOS + Android apps;
  // FB_IAB / FBIOS / FBSS appear on different platforms / SDKs.
  { kind: "fb", re: /\b(FBAN|FBAV|FB_IAB|FBIOS|FBSS|FBDV)\b/ },
  // Messenger has its own user-agent string in addition to the FB tokens above.
  { kind: "messenger", re: /\b(Messenger|MessengerLite|MessengerForiOS)\b/ },
  // Instagram in-app browser.
  { kind: "ig", re: /\bInstagram\b/ },
  // TikTok and the older Musical.ly UA.
  { kind: "tiktok", re: /\b(TikTok|musical_ly|Bytedance)\b/i },
  // LinkedIn in-app browser.
  { kind: "linkedin", re: /\bLinkedInApp\b/ },
];

export function isInAppBrowser(ua: string | null | undefined): IabKind | null {
  if (!ua) return null;
  for (const { kind, re } of IAB_PATTERNS) {
    if (re.test(ua)) return kind;
  }
  return null;
}

export function isAndroid(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return /\bAndroid\b/.test(ua);
}

export function isIOS(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return /\b(iPhone|iPad|iPod)\b/.test(ua);
}

export type MobilePlatform = "android" | "ios";

export function getMobilePlatform(
  ua: string | null | undefined,
): MobilePlatform | null {
  if (isAndroid(ua)) return "android";
  if (isIOS(ua)) return "ios";
  return null;
}

/**
 * True only when the bouncer should run on the server: a known in-app browser
 * AND a mobile platform we can route into the app or store. Desktop UAs and
 * plain mobile browsers always return false.
 */
export function shouldBounce(ua: string | null | undefined): boolean {
  return isInAppBrowser(ua) !== null && getMobilePlatform(ua) !== null;
}
