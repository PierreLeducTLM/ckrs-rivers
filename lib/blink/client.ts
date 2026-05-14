// Minimal Blink (immedia-semi) OAuth client. Ported from blinkpy's auth.py /
// api.py / camera.py but trimmed to what the water-flow sync needs:
//
//   1. Login with username/password (may require email-pin 2FA on first try)
//   2. Refresh access token using the long-lived refresh token
//   3. List cameras via /homescreen
//   4. Request a fresh thumbnail (snap) and poll for completion
//   5. Download the resulting JPEG
//
// Not implemented (out of scope for water-level monitoring): arming, motion
// detection, video clips, live view.

import {
  COMMAND_POLL_INTERVAL_MS,
  COMMAND_POLL_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  OAUTH_CLIENT_ID,
  OAUTH_SCOPE,
  OAUTH_TOKEN_URL,
  TIER_ENDPOINT,
} from "./constants";
import {
  BlinkApiError,
  BlinkInvalidCredentialsError,
  BlinkTwoFARequiredError,
  type BlinkCamera,
  type BlinkCameraType,
  type BlinkTokens,
} from "./types";

interface LoginPayload {
  access_token: string;
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
  // Some flavours of camera have model under different keys
  model?: string;
}

interface HomescreenPayload {
  cameras?: HomescreenCameraPayload[];
  owls?: HomescreenCameraPayload[];
  doorbells?: HomescreenCameraPayload[];
  // Older firmwares put cameras under `cameras_legacy`. We don't need to
  // support those for water-flow but the field is here to acknowledge it.
}

interface CommandPayload {
  id?: number | string;
  network_id?: number | string;
  complete?: boolean;
  status?: number;
}

export interface BlinkSession {
  username: string;
  hardwareId: string;
  tokens: BlinkTokens | null;
}

export interface BlinkClientOptions {
  fetch?: typeof fetch;
  // When set, refreshed-token callbacks are invoked so the caller can persist
  // the new tokens back to wherever they came from (DB row).
  onTokensRefreshed?: (tokens: BlinkTokens) => void | Promise<void>;
}

function classifyCamera(raw: HomescreenCameraPayload, source: "cameras" | "owls" | "doorbells"): BlinkCameraType {
  if (source === "owls") return "mini";
  if (source === "doorbells") return "doorbell";
  return "default";
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

  // ---- auth -------------------------------------------------------------

  /**
   * Initial login (no tokens yet). Throws BlinkTwoFARequiredError on 412 —
   * caller must collect the pin from the user's email and call
   * `verifyTwoFactor()` to complete the flow.
   */
  async login(password: string): Promise<BlinkTokens> {
    return this.tokenRequest({ grantType: "password", password });
  }

  /** Resume login after a 2FA challenge. */
  async verifyTwoFactor(password: string, pin: string): Promise<BlinkTokens> {
    return this.tokenRequest({ grantType: "password", password, twoFactorCode: pin });
  }

  /** Use the refresh token to mint a new access token. */
  async refresh(): Promise<BlinkTokens> {
    const refresh = this.session.tokens?.refreshToken;
    if (!refresh) throw new Error("Blink refresh failed: no refresh token");
    return this.tokenRequest({ grantType: "refresh_token", refreshToken: refresh });
  }

  /** Ensure we have a non-expired access token, refreshing if needed. */
  async ensureValidToken(skewMs = 60_000): Promise<BlinkTokens> {
    const t = this.session.tokens;
    if (!t) throw new Error("Blink client has no tokens (call login() first)");
    if (Date.now() + skewMs < t.expiresAt) return t;
    return this.refresh();
  }

  private async tokenRequest(opts: {
    grantType: "password" | "refresh_token";
    password?: string;
    refreshToken?: string;
    twoFactorCode?: string;
  }): Promise<BlinkTokens> {
    const form = new URLSearchParams();
    form.set("username", this.session.username);
    form.set("client_id", OAUTH_CLIENT_ID);
    form.set("scope", OAUTH_SCOPE);
    form.set("grant_type", opts.grantType);
    if (opts.grantType === "password" && opts.password != null) {
      form.set("password", opts.password);
    }
    if (opts.grantType === "refresh_token" && opts.refreshToken != null) {
      form.set("refresh_token", opts.refreshToken);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": DEFAULT_USER_AGENT,
      hardware_id: this.session.hardwareId,
    };
    if (opts.twoFactorCode) headers["2fa-code"] = opts.twoFactorCode;

    const response = await this.fetchFn(OAUTH_TOKEN_URL, {
      method: "POST",
      headers,
      body: form.toString(),
    });

    if (response.status === 412) throw new BlinkTwoFARequiredError();
    if (response.status === 401) throw new BlinkInvalidCredentialsError();
    if (!response.ok) {
      const body = await response.text().catch(() => null);
      throw new BlinkApiError(`Blink token request failed (${response.status})`, response.status, OAUTH_TOKEN_URL, body);
    }

    const payload = (await response.json()) as LoginPayload;
    if (!payload.access_token) {
      throw new BlinkApiError("Blink token response missing access_token", response.status, OAUTH_TOKEN_URL);
    }

    // We still need tier info on first login to figure out which region host
    // serves this account.
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
      throw new BlinkApiError("Blink login succeeded but account_id is missing", response.status, OAUTH_TOKEN_URL);
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
    return tokens;
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
    return { tierHost: `${tier}.immedia-semi.com`, accountId };
  }

  // ---- camera endpoints ------------------------------------------------

  /**
   * Fetch the homescreen, which contains all cameras across all sync modules
   * (networks). We flatten owls/doorbells/cameras into a single list,
   * tagging each with its origin so we can build the right URL later.
   */
  async listCameras(): Promise<BlinkCamera[]> {
    const tokens = await this.ensureValidToken();
    const url = `https://${tokens.tierHost}/api/v3/accounts/${tokens.accountId}/homescreen`;
    const response = await this.authedGet(url);
    const payload = (await response.json()) as HomescreenPayload;

    const out: BlinkCamera[] = [];
    const push = (raw: HomescreenCameraPayload, source: "cameras" | "owls" | "doorbells") => {
      if (raw.id == null || raw.network_id == null) return;
      out.push({
        id: raw.id,
        networkId: raw.network_id,
        name: typeof raw.name === "string" ? raw.name : String(raw.id),
        type: classifyCamera(raw, source),
        model: typeof raw.model === "string" ? raw.model : (typeof raw.type === "string" ? raw.type : null),
        thumbnailPath: typeof raw.thumbnail === "string" ? raw.thumbnail : null,
        thumbnailUpdatedAt: parseDate(raw.updated_at),
      });
    };
    for (const c of payload.cameras ?? []) push(c, "cameras");
    for (const c of payload.owls ?? []) push(c, "owls");
    for (const c of payload.doorbells ?? []) push(c, "doorbells");
    return out;
  }

  /**
   * Trigger a fresh photo on the camera. Returns a network/command id pair
   * the caller can use with `waitForCommand` to know when the new thumbnail
   * is ready.
   */
  async snapPicture(camera: Pick<BlinkCamera, "id" | "networkId" | "type">): Promise<{ networkId: number | string; commandId: number | string }> {
    const tokens = await this.ensureValidToken();
    const url = this.cameraActionUrl(tokens, camera, "snap");
    const response = await this.authedPost(url);
    const payload = (await response.json().catch(() => null)) as CommandPayload | null;
    if (!payload || payload.id == null) {
      throw new BlinkApiError("Blink snap response missing command id", response.status, url);
    }
    return { networkId: camera.networkId, commandId: payload.id };
  }

  /**
   * Poll the command-status endpoint until the snap completes or we time
   * out. Resolves to true on completion; on timeout the caller can still
   * proceed and fetch the previous thumbnail.
   */
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

  /**
   * Download the current thumbnail JPEG for a camera. Uses the
   * `thumbnailPath` returned by `listCameras` — call `listCameras` AFTER
   * `snapPicture`+`waitForCommand` if you want the fresh image.
   */
  async fetchThumbnail(camera: BlinkCamera): Promise<Uint8Array> {
    const tokens = await this.ensureValidToken();
    if (!camera.thumbnailPath) {
      throw new BlinkApiError(`Blink camera ${camera.id} has no thumbnail`, 404, "");
    }
    // The path Blink returns omits the ".jpg" suffix and the query string
    // (the official apps append the updated_at timestamp as ts=...).
    const ts = camera.thumbnailUpdatedAt ? camera.thumbnailUpdatedAt.getTime() : Date.now();
    const path = camera.thumbnailPath.endsWith(".jpg") ? camera.thumbnailPath : `${camera.thumbnailPath}.jpg`;
    const url = `https://${tokens.tierHost}${path}?ts=${ts}`;
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

  // ---- low-level helpers ----------------------------------------------

  // The `action` arg is kept positional so this helper can be extended later
  // (record, liveview, ...) without changing call sites.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private cameraActionUrl(tokens: BlinkTokens, camera: Pick<BlinkCamera, "id" | "networkId" | "type">, action: "snap"): string {
    const host = `https://${tokens.tierHost}`;
    if (camera.type === "mini") {
      return `${host}/api/v1/accounts/${tokens.accountId}/networks/${camera.networkId}/owls/${camera.id}/thumbnail`;
    }
    if (camera.type === "doorbell") {
      return `${host}/api/v1/accounts/${tokens.accountId}/networks/${camera.networkId}/doorbells/${camera.id}/thumbnail`;
    }
    // Outdoor / XT2 / default — uses the older /network path.
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
