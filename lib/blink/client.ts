// Blink (immedia-semi) client. Ported from blinkpy v0.23+ which switched
// to OAuth 2.0 authorization-code flow with PKCE — the older password
// grant we initially used now returns `unsupported_grant_type`.
//
// Flow (6 steps, session-cookie-bound):
//   1. PKCE pair: code_verifier + code_challenge (S256)
//   2. GET  /oauth/v2/authorize   — primes session with device + challenge
//   3. GET  /oauth/v2/signin      — HTML signin page, extract csrf-token
//   4. POST /oauth/v2/signin      — submit credentials
//        ↳ 30x: success without 2FA → step 6 immediately
//        ↳ 412: 2FA required → persist transient state, throw, resume later
//   5. POST /oauth/v2/2fa/verify  — submit email pin
//   6. GET  /oauth/v2/authorize   — returns 30x with ?code=... in Location
//   7. POST /oauth/token          — exchange code (+ code_verifier) for tokens
//
// All steps share a cookie jar — Node's fetch doesn't auto-manage cookies,
// so we capture Set-Cookie ourselves and replay on the next request.

import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  APP_BRAND,
  APP_VERSION,
  COMMAND_POLL_INTERVAL_MS,
  COMMAND_POLL_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  DEVICE_BRAND,
  DEVICE_MODEL,
  DEVICE_OS_VERSION,
  OAUTH_2FA_VERIFY_URL,
  OAUTH_AUTHORIZE_URL,
  OAUTH_REDIRECT_URI,
  OAUTH_SCOPE,
  OAUTH_SIGNIN_URL,
  OAUTH_TOKEN_URL,
  OAUTH_TOKEN_USER_AGENT,
  OAUTH_USER_AGENT,
  OAUTH_V2_CLIENT_ID,
  TIER_ENDPOINT,
} from "./constants";
import {
  BlinkApiError,
  BlinkInvalidCredentialsError,
  BlinkTwoFARequiredError,
  type BlinkCamera,
  type BlinkCameraType,
  type BlinkPendingAuth,
  type BlinkTokens,
} from "./types";

// ---------------------------------------------------------------------------
// PKCE helpers (RFC 7636)
// ---------------------------------------------------------------------------

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64UrlEncode(randomBytes(32));
  const codeChallenge = base64UrlEncode(createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

// ---------------------------------------------------------------------------
// Cookie jar — minimal name=value tracking, sufficient for a short-lived
// signin session against a single host.
// ---------------------------------------------------------------------------

class CookieJar {
  private cookies: Map<string, string> = new Map();

  constructor(initial?: Record<string, string>) {
    if (initial) for (const [k, v] of Object.entries(initial)) this.cookies.set(k, v);
  }

  ingestResponse(response: Response): void {
    // Node 19.7+ / undici expose getSetCookie(); fall back to raw header
    // parsing if it's not available.
    const raw = typeof (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (response.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
      : [response.headers.get("set-cookie")].filter((v): v is string => v != null);
    for (const cookie of raw) {
      const first = cookie.split(";", 1)[0];
      const eq = first.indexOf("=");
      if (eq <= 0) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      // Deleting cookies: server sends value of "" or attribute Max-Age=0
      // (we don't bother parsing attributes — empty value is enough).
      if (value === "" || /(?:^|;\s*)Max-Age=0\b/i.test(cookie)) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  header(): string | null {
    if (this.cookies.size === 0) return null;
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.cookies.entries());
  }
}

// ---------------------------------------------------------------------------
// CSRF extraction. The signin page HTML embeds:
//   <script id="oauth-args" type="application/json">{"csrf-token":"...", ...}</script>
// ---------------------------------------------------------------------------

function extractCsrfToken(html: string): string | null {
  const match = html.match(
    /<script\b[^>]*\bid=["']oauth-args["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]) as Record<string, unknown>;
    const token = data["csrf-token"];
    return typeof token === "string" ? token : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Token-response payload shape
// ---------------------------------------------------------------------------

interface TokenResponsePayload {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  account?: { account_id?: number | string; client_id?: number | string };
}

interface TierInfoPayload {
  tier?: string;
  region?: { tier?: string };
  account_id?: number | string;
  account?: { id?: number | string };
}

interface HomescreenCameraPayload {
  id: number | string;
  network_id?: number | string;
  name?: string;
  type?: string;
  thumbnail?: string;
  updated_at?: string;
  model?: string;
}

interface HomescreenPayload {
  cameras?: HomescreenCameraPayload[];
  owls?: HomescreenCameraPayload[];
  doorbells?: HomescreenCameraPayload[];
}

interface CameraUsageNetwork {
  network_id?: number | string;
  cameras?: Array<{ id?: number | string; name?: string }>;
}
interface CameraUsagePayload {
  networks?: CameraUsageNetwork[];
}

interface CameraConfigPayload {
  camera?: Array<{
    id?: number | string;
    name?: string;
    type?: string; // raw blink product_type — "catalina", "owl", "lotus", etc.
    thumbnail?: string | number;
    updated_at?: string;
  }>;
}

interface CommandPayload {
  id?: number | string;
  network_id?: number | string;
  complete?: boolean;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface BlinkSession {
  username: string;
  hardwareId: string;
  tokens: BlinkTokens | null;
  pending?: BlinkPendingAuth | null;
}

export interface BlinkClientOptions {
  fetch?: typeof fetch;
  onTokensRefreshed?: (tokens: BlinkTokens) => void | Promise<void>;
}

function parseDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export class BlinkClient {
  private readonly fetchFn: typeof fetch;
  private readonly onTokensRefreshed?: (tokens: BlinkTokens) => void | Promise<void>;
  private session: BlinkSession;

  constructor(session: BlinkSession, options: BlinkClientOptions = {}) {
    this.session = session;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.onTokensRefreshed = options.onTokensRefreshed;
  }

  get tokens(): BlinkTokens | null {
    return this.session.tokens;
  }

  // -------------------------------------------------------------------------
  // Public auth API
  // -------------------------------------------------------------------------

  /**
   * Initial OAuth login. On success returns tokens; on 412 throws
   * `BlinkTwoFARequiredError` carrying the transient state needed to
   * complete the flow once the admin enters the email pin.
   */
  async login(password: string): Promise<BlinkTokens> {
    const { codeVerifier, codeChallenge } = generatePkcePair();
    const jar = new CookieJar();

    await this.oauthAuthorize(jar, codeChallenge);
    const csrfToken = await this.oauthGetSigninPage(jar);

    const signinStatus = await this.oauthSubmitSignin(jar, csrfToken, password);

    if (signinStatus === "2FA_REQUIRED") {
      // Persist state so /verify-2fa can resume the same session.
      throw new BlinkTwoFARequiredError({
        codeVerifier,
        csrfToken,
        cookies: jar.snapshot(),
      });
    }

    // Account didn't need 2FA — proceed straight to code exchange.
    const code = await this.oauthGetAuthorizationCode(jar);
    const tokens = await this.oauthExchangeCode(code, codeVerifier);
    await this.completeTokens(tokens);
    return this.session.tokens!;
  }

  /**
   * Complete the 2FA half of the v2 flow. Requires the pending state from
   * the failed `login()` call to be on the session.
   */
  async verifyTwoFactor(pin: string): Promise<BlinkTokens> {
    const pending = this.session.pending;
    if (!pending) throw new Error("verifyTwoFactor called without pending auth state");

    const jar = new CookieJar(pending.cookies);

    await this.oauthVerify2fa(jar, pending.csrfToken, pin);
    const code = await this.oauthGetAuthorizationCode(jar);
    const tokens = await this.oauthExchangeCode(code, pending.codeVerifier);
    await this.completeTokens(tokens);
    this.session.pending = null;
    return this.session.tokens!;
  }

  /** Refresh the access token using the stored refresh_token. */
  async refresh(): Promise<BlinkTokens> {
    const existing = this.session.tokens;
    if (!existing?.refreshToken) throw new Error("Blink refresh failed: no refresh token");

    const form = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: existing.refreshToken,
      client_id: OAUTH_V2_CLIENT_ID,
      scope: OAUTH_SCOPE,
      hardware_id: this.session.hardwareId,
    });

    const response = await this.fetchFn(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": OAUTH_TOKEN_USER_AGENT,
        Accept: "*/*",
      },
      body: form.toString(),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => null);
      throw new BlinkApiError(`Blink refresh failed (${response.status})`, response.status, OAUTH_TOKEN_URL, body);
    }
    const payload = (await response.json()) as TokenResponsePayload;
    await this.completeTokens(payload);
    return this.session.tokens!;
  }

  async ensureValidToken(skewMs = 60_000): Promise<BlinkTokens> {
    const t = this.session.tokens;
    if (!t) throw new Error("Blink client has no tokens (call login() first)");
    if (Date.now() + skewMs < t.expiresAt) return t;
    return this.refresh();
  }

  // -------------------------------------------------------------------------
  // OAuth v2 step implementations
  // -------------------------------------------------------------------------

  private async oauthAuthorize(jar: CookieJar, codeChallenge: string): Promise<void> {
    const params = new URLSearchParams({
      app_brand: APP_BRAND,
      app_version: APP_VERSION,
      client_id: OAUTH_V2_CLIENT_ID,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      device_brand: DEVICE_BRAND,
      device_model: DEVICE_MODEL,
      device_os_version: DEVICE_OS_VERSION,
      hardware_id: this.session.hardwareId,
      redirect_uri: OAUTH_REDIRECT_URI,
      response_type: "code",
      scope: OAUTH_SCOPE,
    });
    const url = `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
    const response = await this.fetchFn(url, {
      method: "GET",
      headers: {
        "User-Agent": OAUTH_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "manual",
    });
    jar.ingestResponse(response);
    if (response.status !== 200 && response.status < 300) {
      // 300 range is acceptable here too — server sometimes redirects.
      // Anything else is a problem.
      const body = await response.text().catch(() => null);
      throw new BlinkApiError(`Blink authorize step failed (${response.status})`, response.status, url, body);
    }
  }

  private async oauthGetSigninPage(jar: CookieJar): Promise<string> {
    const response = await this.fetchFn(OAUTH_SIGNIN_URL, {
      method: "GET",
      headers: {
        "User-Agent": OAUTH_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...(jar.header() ? { Cookie: jar.header()! } : {}),
      },
    });
    jar.ingestResponse(response);
    if (!response.ok) {
      const body = await response.text().catch(() => null);
      throw new BlinkApiError(`Blink signin page fetch failed (${response.status})`, response.status, OAUTH_SIGNIN_URL, body);
    }
    const html = await response.text();
    const token = extractCsrfToken(html);
    if (!token) {
      throw new BlinkApiError("Could not extract CSRF token from Blink signin page", response.status, OAUTH_SIGNIN_URL, html.slice(0, 500));
    }
    return token;
  }

  private async oauthSubmitSignin(jar: CookieJar, csrfToken: string, password: string): Promise<"SUCCESS" | "2FA_REQUIRED"> {
    const form = new URLSearchParams({
      username: this.session.username,
      password,
      "csrf-token": csrfToken,
    });
    const response = await this.fetchFn(OAUTH_SIGNIN_URL, {
      method: "POST",
      headers: {
        "User-Agent": OAUTH_USER_AGENT,
        Accept: "*/*",
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://api.oauth.blink.com",
        Referer: OAUTH_SIGNIN_URL,
        ...(jar.header() ? { Cookie: jar.header()! } : {}),
      },
      body: form.toString(),
      redirect: "manual",
    });
    jar.ingestResponse(response);

    if (response.status === 412) return "2FA_REQUIRED";
    if (response.status >= 300 && response.status < 400) return "SUCCESS";
    if (response.status === 401 || response.status === 403) {
      const body = await response.text().catch(() => null);
      throw new BlinkInvalidCredentialsError(body);
    }
    const body = await response.text().catch(() => null);
    throw new BlinkApiError(`Blink signin failed (${response.status})`, response.status, OAUTH_SIGNIN_URL, body);
  }

  private async oauthVerify2fa(jar: CookieJar, csrfToken: string, pin: string): Promise<void> {
    const form = new URLSearchParams({
      "2fa_code": pin,
      "csrf-token": csrfToken,
      remember_me: "false",
    });
    const response = await this.fetchFn(OAUTH_2FA_VERIFY_URL, {
      method: "POST",
      headers: {
        "User-Agent": OAUTH_USER_AGENT,
        Accept: "*/*",
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://api.oauth.blink.com",
        Referer: OAUTH_SIGNIN_URL,
        ...(jar.header() ? { Cookie: jar.header()! } : {}),
      },
      body: form.toString(),
    });
    jar.ingestResponse(response);

    if (response.status !== 201) {
      const body = await response.text().catch(() => null);
      throw new BlinkInvalidCredentialsError(body);
    }
    const payload = (await response.json().catch(() => null)) as { status?: string } | null;
    if (payload?.status !== "auth-completed") {
      throw new BlinkInvalidCredentialsError(JSON.stringify(payload));
    }
  }

  private async oauthGetAuthorizationCode(jar: CookieJar): Promise<string> {
    // Blink returns a 30x with the auth code in the Location query string.
    const response = await this.fetchFn(OAUTH_AUTHORIZE_URL, {
      method: "GET",
      headers: {
        "User-Agent": OAUTH_USER_AGENT,
        Accept: "*/*",
        Referer: OAUTH_SIGNIN_URL,
        ...(jar.header() ? { Cookie: jar.header()! } : {}),
      },
      redirect: "manual",
    });
    jar.ingestResponse(response);

    if (response.status < 300 || response.status >= 400) {
      const body = await response.text().catch(() => null);
      throw new BlinkApiError(`Blink authorize-code step expected redirect, got ${response.status}`, response.status, OAUTH_AUTHORIZE_URL, body);
    }
    const location = response.headers.get("location");
    if (!location) throw new BlinkApiError("Blink authorize-code step missing Location header", response.status, OAUTH_AUTHORIZE_URL);
    // Location can be a relative or absolute URL, or a custom scheme like
    // immedia-blink://... — only the query string matters.
    const qIdx = location.indexOf("?");
    if (qIdx < 0) throw new BlinkApiError("Blink authorize-code Location has no query", response.status, OAUTH_AUTHORIZE_URL, location);
    const params = new URLSearchParams(location.slice(qIdx + 1));
    const code = params.get("code");
    if (!code) throw new BlinkApiError("Blink authorize-code Location missing `code`", response.status, OAUTH_AUTHORIZE_URL, location);
    return code;
  }

  private async oauthExchangeCode(code: string, codeVerifier: string): Promise<TokenResponsePayload> {
    const form = new URLSearchParams({
      app_brand: APP_BRAND,
      client_id: OAUTH_V2_CLIENT_ID,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      hardware_id: this.session.hardwareId,
      redirect_uri: OAUTH_REDIRECT_URI,
      scope: OAUTH_SCOPE,
    });
    const response = await this.fetchFn(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "User-Agent": OAUTH_TOKEN_USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "*/*",
      },
      body: form.toString(),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => null);
      throw new BlinkApiError(`Blink token exchange failed (${response.status})`, response.status, OAUTH_TOKEN_URL, body);
    }
    return (await response.json()) as TokenResponsePayload;
  }

  private async completeTokens(payload: TokenResponsePayload): Promise<void> {
    if (!payload.access_token) {
      throw new BlinkApiError("Blink token response missing access_token", 200, OAUTH_TOKEN_URL, JSON.stringify(payload));
    }
    const existing = this.session.tokens;
    let tierHost = existing?.tierHost ?? null;
    let accountId = existing?.accountId ?? payload.account?.account_id ?? null;
    const clientId = existing?.clientId ?? payload.account?.client_id ?? null;

    if (!tierHost) {
      const tier = await this.fetchTierInfo(payload.access_token);
      tierHost = tier.tierHost;
      accountId = accountId ?? tier.accountId;
    }
    if (accountId == null) {
      throw new BlinkApiError("Blink login succeeded but account_id is missing", 200, OAUTH_TOKEN_URL);
    }

    const tokens: BlinkTokens = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? existing?.refreshToken ?? null,
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
      tierHost,
      accountId,
      clientId,
    };
    this.session.tokens = tokens;
    if (this.onTokensRefreshed) await this.onTokensRefreshed(tokens);
  }

  private async fetchTierInfo(accessToken: string): Promise<{ tierHost: string; accountId: number | string }> {
    const response = await this.fetchFn(TIER_ENDPOINT, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": DEFAULT_USER_AGENT,
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => null);
      throw new BlinkApiError(`Blink tier_info failed (${response.status})`, response.status, TIER_ENDPOINT, body);
    }
    const payload = (await response.json()) as TierInfoPayload;
    const tier = payload.tier ?? payload.region?.tier ?? null;
    const accountId = payload.account_id ?? payload.account?.id ?? null;
    if (!tier || accountId == null) {
      throw new BlinkApiError("Blink tier_info response missing tier/account_id", response.status, TIER_ENDPOINT);
    }
    return { tierHost: `${tier}.${"immedia-semi.com"}`, accountId };
  }

  // -------------------------------------------------------------------------
  // Camera endpoints (unchanged from previous version)
  // -------------------------------------------------------------------------

  /**
   * Enumerate every camera on the account. blinkpy's setup_camera_list
   * uses three sources because Blink's API split cameras across them:
   *
   *  - `/api/v1/camera/usage` → "default"-family cameras (Outdoor 4 / XT /
   *    XT2 / etc.) grouped by sync-module network.
   *  - `homescreen.owls`      → Mini cameras (sync-less).
   *  - `homescreen.doorbells` → Doorbells.
   *
   * For each camera we then fetch `/network/{nid}/camera/{cid}/config` to
   * get the raw product_type and the thumbnail timestamp — without
   * those we can't build the v3 media URL.
   */
  async listCameras(): Promise<BlinkCamera[]> {
    const tokens = await this.ensureValidToken();
    const host = `https://${tokens.tierHost}`;

    interface Stub {
      id: number | string;
      networkId: number | string;
      name: string;
      type: BlinkCameraType;
    }
    const stubs: Stub[] = [];

    // 1) Default cameras via camera/usage
    try {
      const usageResp = await this.authedGet(`${host}/api/v1/camera/usage`);
      const usage = (await usageResp.json()) as CameraUsagePayload;
      for (const network of usage.networks ?? []) {
        if (network.network_id == null) continue;
        for (const cam of network.cameras ?? []) {
          if (cam.id == null) continue;
          stubs.push({
            id: cam.id,
            networkId: network.network_id,
            name: typeof cam.name === "string" ? cam.name : String(cam.id),
            type: "default",
          });
        }
      }
    } catch {
      // Tolerate — proceed with whatever the homescreen returns.
    }

    // 2) Owls + doorbells via homescreen
    try {
      const homeResp = await this.authedGet(`${host}/api/v3/accounts/${tokens.accountId}/homescreen`);
      const home = (await homeResp.json()) as HomescreenPayload;
      for (const owl of home.owls ?? []) {
        if (owl.id == null || owl.network_id == null) continue;
        stubs.push({
          id: owl.id,
          networkId: owl.network_id,
          name: typeof owl.name === "string" ? owl.name : String(owl.id),
          type: "mini",
        });
      }
      for (const db of home.doorbells ?? []) {
        if (db.id == null || db.network_id == null) continue;
        stubs.push({
          id: db.id,
          networkId: db.network_id,
          name: typeof db.name === "string" ? db.name : String(db.id),
          type: "doorbell",
        });
      }
    } catch {
      // Tolerate — the user may not have any owls/doorbells.
    }

    // 3) Hydrate each stub with config (product_type + thumbnail)
    const out: BlinkCamera[] = [];
    for (const stub of stubs) {
      let productType: string | null = null;
      let rawThumbnail: string | number | null = null;
      let updatedAt: Date | null = null;
      try {
        const cfgResp = await this.authedGet(
          `${host}/network/${stub.networkId}/camera/${stub.id}/config`,
        );
        const cfgBody = (await cfgResp.json()) as CameraConfigPayload;
        const entry = cfgBody.camera?.[0];
        if (entry) {
          productType = typeof entry.type === "string" ? entry.type : null;
          rawThumbnail = entry.thumbnail ?? null;
          updatedAt = parseDate(entry.updated_at);
        }
      } catch {
        // Best-effort — we still surface the camera, just without thumbnail.
      }

      let thumbnailPath: string | null = null;
      if (rawThumbnail != null) {
        const asString = String(rawThumbnail);
        // New API: integer timestamp → build the v3 media URL.
        if (/^\d+$/.test(asString) && productType) {
          thumbnailPath = `/api/v3/media/accounts/${tokens.accountId}/networks/${stub.networkId}/${productType}/${stub.id}/thumbnail/thumbnail.jpg?ts=${asString}&ext=`;
          // `thumbnail` is unix seconds in the new API.
          if (!updatedAt) updatedAt = new Date(Number(asString) * 1000);
        } else if (asString.endsWith("&ext=")) {
          thumbnailPath = asString;
        } else {
          thumbnailPath = asString.endsWith(".jpg") ? asString : `${asString}.jpg`;
        }
      }

      out.push({
        id: stub.id,
        networkId: stub.networkId,
        name: stub.name,
        type: stub.type,
        productType,
        model: productType,
        thumbnailPath,
        thumbnailUpdatedAt: updatedAt,
      });
    }
    return out;
  }

  async snapPicture(camera: Pick<BlinkCamera, "id" | "networkId" | "type">): Promise<{ networkId: number | string; commandId: number | string }> {
    const tokens = await this.ensureValidToken();
    const url = this.cameraActionUrl(tokens, camera);
    const response = await this.authedPost(url);
    const payload = (await response.json().catch(() => null)) as CommandPayload | null;
    if (!payload || payload.id == null) {
      throw new BlinkApiError("Blink snap response missing command id", response.status, url);
    }
    return { networkId: camera.networkId, commandId: payload.id };
  }

  async waitForCommand(networkId: number | string, commandId: number | string, opts: { timeoutMs?: number; intervalMs?: number } = {}): Promise<boolean> {
    const tokens = await this.ensureValidToken();
    const timeoutMs = opts.timeoutMs ?? COMMAND_POLL_TIMEOUT_MS;
    const intervalMs = opts.intervalMs ?? COMMAND_POLL_INTERVAL_MS;
    const deadline = Date.now() + timeoutMs;
    const url = `https://${tokens.tierHost}/network/${networkId}/command/${commandId}`;

    while (Date.now() < deadline) {
      const response = await this.authedGet(url);
      const payload = (await response.json().catch(() => null)) as CommandPayload | null;
      if (payload?.complete) return true;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
  }

  async fetchThumbnail(camera: BlinkCamera): Promise<Uint8Array> {
    const tokens = await this.ensureValidToken();
    if (!camera.thumbnailPath) {
      throw new BlinkApiError(`Blink camera ${camera.id} has no thumbnail`, 404, "");
    }
    // thumbnailPath is already fully-formed by listCameras — either an
    // absolute URL or a leading-slash path relative to the tier host.
    const url = camera.thumbnailPath.startsWith("http")
      ? camera.thumbnailPath
      : `https://${tokens.tierHost}${camera.thumbnailPath}`;
    const response = await this.fetchFn(url, {
      method: "GET",
      headers: this.authHeaders(tokens),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => null);
      throw new BlinkApiError(`Blink thumbnail download failed (${response.status})`, response.status, url, body);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  private cameraActionUrl(tokens: BlinkTokens, camera: Pick<BlinkCamera, "id" | "networkId" | "type">): string {
    const host = `https://${tokens.tierHost}`;
    if (camera.type === "mini") {
      return `${host}/api/v1/accounts/${tokens.accountId}/networks/${camera.networkId}/owls/${camera.id}/thumbnail`;
    }
    if (camera.type === "doorbell") {
      return `${host}/api/v1/accounts/${tokens.accountId}/networks/${camera.networkId}/doorbells/${camera.id}/thumbnail`;
    }
    return `${host}/network/${camera.networkId}/camera/${camera.id}/thumbnail`;
  }

  private authHeaders(tokens: BlinkTokens): Record<string, string> {
    return {
      "TOKEN-AUTH": tokens.accessToken,
      Authorization: `Bearer ${tokens.accessToken}`,
      "User-Agent": DEFAULT_USER_AGENT,
    };
  }

  private async authedGet(url: string): Promise<Response> {
    const tokens = await this.ensureValidToken();
    const response = await this.fetchFn(url, { method: "GET", headers: this.authHeaders(tokens) });
    if (!response.ok) {
      const body = await response.text().catch(() => null);
      throw new BlinkApiError(`Blink GET ${url} failed (${response.status})`, response.status, url, body);
    }
    return response;
  }

  private async authedPost(url: string, body?: unknown): Promise<Response> {
    const tokens = await this.ensureValidToken();
    const headers = { ...this.authHeaders(tokens), "Content-Type": "application/json" };
    const response = await this.fetchFn(url, {
      method: "POST",
      headers,
      body: body == null ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => null);
      throw new BlinkApiError(`Blink POST ${url} failed (${response.status})`, response.status, url, text);
    }
    return response;
  }
}

// Re-export randomUUID so account-store doesn't have to duplicate the import
export { randomUUID };
