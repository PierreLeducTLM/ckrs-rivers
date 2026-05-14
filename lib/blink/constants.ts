// Constants ported from blinkpy's helpers/constants.py.
// blinkpy is the unofficial Python SDK for the Blink camera system; the
// endpoints here are the same ones the official Android/iOS apps hit.

export const BLINK_DOMAIN = "immedia-semi.com";
export const DEFAULT_HOST = `rest-prod.${BLINK_DOMAIN}`;
export const DEFAULT_BASE_URL = `https://${DEFAULT_HOST}`;

export const OAUTH_BASE_URL = "https://api.oauth.blink.com";
export const OAUTH_TOKEN_URL = `${OAUTH_BASE_URL}/oauth/token`;
export const TIER_ENDPOINT = `${DEFAULT_BASE_URL}/api/v1/users/tier_info`;

export const OAUTH_CLIENT_ID = "android";
export const OAUTH_SCOPE = "client";
export const DEFAULT_USER_AGENT = "27.0ANDROID_28373244";

// Command polling — Blink's "snap a new picture" endpoint returns a command
// id; we poll the command-status endpoint until done or timeout.
export const COMMAND_POLL_INTERVAL_MS = 1_000;
export const COMMAND_POLL_TIMEOUT_MS = 30_000;
