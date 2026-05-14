// Constants ported from blinkpy's helpers/constants.py.
// blinkpy is the unofficial Python SDK for the Blink camera system; the
// endpoints here mirror what the iOS Blink app hits.
//
// Blink retired the OAuth `password` grant. We now use the v2 flow
// (authorization code + PKCE, with an HTML/CSRF signin page in the
// middle). The "v1" endpoints are kept for tier_info only.

export const BLINK_DOMAIN = "immedia-semi.com";
export const DEFAULT_HOST = `rest-prod.${BLINK_DOMAIN}`;
export const DEFAULT_BASE_URL = `https://${DEFAULT_HOST}`;

export const OAUTH_BASE_URL = "https://api.oauth.blink.com";
export const OAUTH_TOKEN_URL = `${OAUTH_BASE_URL}/oauth/token`;
export const OAUTH_AUTHORIZE_URL = `${OAUTH_BASE_URL}/oauth/v2/authorize`;
export const OAUTH_SIGNIN_URL = `${OAUTH_BASE_URL}/oauth/v2/signin`;
export const OAUTH_2FA_VERIFY_URL = `${OAUTH_BASE_URL}/oauth/v2/2fa/verify`;
export const TIER_ENDPOINT = `${DEFAULT_BASE_URL}/api/v1/users/tier_info`;

export const OAUTH_V2_CLIENT_ID = "ios";
export const OAUTH_REDIRECT_URI = "immedia-blink://applinks.blink.com/signin/callback";
export const OAUTH_SCOPE = "client";

// User-Agent strings used by the real iOS app — Blink fingerprints these.
export const OAUTH_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1";
export const OAUTH_TOKEN_USER_AGENT =
  "Blink/2511191620 CFNetwork/3860.200.71 Darwin/25.1.0";
// Used for the (v1) tier_info request.
export const DEFAULT_USER_AGENT = "27.0ANDROID_28373244";

// Device parameters sent on the authorize step. blinkpy hardcodes iPhone
// values; we follow suit because the server fingerprints these.
export const DEVICE_BRAND = "Apple";
export const DEVICE_MODEL = "iPhone16,1";
export const DEVICE_OS_VERSION = "26.1";
export const APP_BRAND = "blink";
export const APP_VERSION = "50.1";

// Command polling — Blink's "snap a new picture" endpoint returns a command
// id; we poll the command-status endpoint until done or timeout.
export const COMMAND_POLL_INTERVAL_MS = 1_000;
export const COMMAND_POLL_TIMEOUT_MS = 30_000;
