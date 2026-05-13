import {
  SpypointApiError,
  SpypointApiInvalidCredentialsError,
  type SpypointCamera,
  type SpypointPhoto,
  type SpypointPhotoSize,
  type SpypointPhotoUrlSection,
  photoUrl,
} from "./types";

const DEFAULT_BASE_URL = "https://restapi.spypoint.com/api/v3";
const ONLINE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

interface JwtClaims {
  exp: number;
}

function decodeJwtClaims(token: string): JwtClaims {
  const parts = token.split(".");
  if (parts.length < 2) throw new Error("Invalid JWT");
  const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = payload + "===".slice((payload.length + 3) % 4);
  const json = Buffer.from(padded, "base64").toString("utf8");
  return JSON.parse(json) as JwtClaims;
}

// The reference JS strips the trailing Z and treats the datetime as local time.
// We parse as UTC instead so behaviour is deterministic regardless of TZ
// (the Spypoint API consistently returns Z-suffixed ISO strings).
function parseSpypointDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?/.exec(raw);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, frac] = m;
  const ms = frac ? Number(frac.padEnd(3, "0").slice(0, 3)) : 0;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), ms));
}

function parseCamera(data: Record<string, unknown>): SpypointCamera {
  const config = (data.config ?? {}) as Record<string, unknown>;
  const status = (data.status ?? {}) as Record<string, unknown>;
  const lastUpdateTime = parseSpypointDate(status.lastUpdate);
  return {
    id: String(data.id),
    name: typeof config.name === "string" ? config.name : String(data.id),
    model: typeof status.model === "string" ? status.model : null,
    lastUpdateTime,
    isOnline: lastUpdateTime ? Date.now() - lastUpdateTime.getTime() <= ONLINE_THRESHOLD_MS : false,
  };
}

function parsePhotoSection(raw: unknown): SpypointPhotoUrlSection | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.host !== "string" || typeof s.path !== "string") return null;
  return { host: s.host, path: s.path };
}

function parsePhoto(data: Record<string, unknown>): SpypointPhoto {
  return {
    id: String(data.id),
    cameraId: typeof data.camera === "string"
      ? data.camera
      : typeof data.cameraId === "string"
        ? data.cameraId
        : null,
    date: parseSpypointDate(data.date),
    hd: typeof data.hd === "boolean" ? data.hd : null,
    small: parsePhotoSection(data.small),
    medium: parsePhotoSection(data.medium),
    large: parsePhotoSection(data.large),
  };
}

export interface SpypointClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class SpypointClient {
  private readonly username: string;
  private readonly password: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private headers: Record<string, string> = { "Content-Type": "application/json" };
  private expiresAt: Date = new Date(Date.now() - 1000);

  constructor(username: string, password: string, options: SpypointClientOptions = {}) {
    this.username = username;
    this.password = password;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async authenticate(): Promise<void> {
    if (new Date() < this.expiresAt) return;

    const response = await this.fetchFn(`${this.baseUrl}/user/login`, {
      method: "POST",
      headers: { ...this.headers },
      body: JSON.stringify({ username: this.username, password: this.password }),
    });

    if (response.status === 401) throw new SpypointApiInvalidCredentialsError(response);
    if (!response.ok) throw new SpypointApiError(response);

    const data = (await response.json()) as { token: string };
    const claims = decodeJwtClaims(data.token);
    this.headers.Authorization = `Bearer ${data.token}`;
    this.expiresAt = new Date(claims.exp * 1000);
  }

  async getCameras(): Promise<SpypointCamera[]> {
    const [own, shared] = await Promise.all([this.getOwnCameras(), this.getSharedCameras()]);
    return [...own, ...shared];
  }

  async getOwnCameras(): Promise<SpypointCamera[]> {
    const response = await this.get("/camera/all");
    const body = (await response.json()) as Record<string, unknown>[];
    return (body ?? []).map(parseCamera);
  }

  async getSharedCameras(): Promise<SpypointCamera[]> {
    const response = await this.get("/shared-cameras/all");
    const body = (await response.json()) as { cameras?: Array<{ id: string }> };
    const ids = (body.cameras ?? []).map((c) => c.id);
    return Promise.all(ids.map((id) => this.getSharedCamera(id)));
  }

  private async getSharedCamera(cameraId: string): Promise<SpypointCamera> {
    const response = await this.get(`/shared-cameras/${cameraId}`);
    const body = (await response.json()) as Record<string, unknown>;
    return parseCamera({ ...body, id: cameraId });
  }

  async getPhotos(opts: {
    cameras: Array<string | { id: string }>;
    dateEnd?: string;
    hd?: boolean;
    favorite?: boolean;
    limit?: number;
    tags?: string[];
  }): Promise<SpypointPhoto[]> {
    if (!Array.isArray(opts.cameras) || opts.cameras.length === 0) {
      throw new Error("getPhotos: `cameras` must be a non-empty array");
    }
    const cameraIds = opts.cameras.map((c) => (typeof c === "string" ? c : c.id));
    const response = await this.post("/photo/all", {
      camera: cameraIds,
      dateEnd: opts.dateEnd ?? "2100-01-01T00:00:00.000Z",
      favorite: opts.favorite ?? false,
      hd: opts.hd ?? false,
      limit: opts.limit ?? 100,
      tag: opts.tags ?? [],
    });
    const body = (await response.json()) as { photos?: Record<string, unknown>[] };
    return (body.photos ?? []).map(parsePhoto);
  }

  async downloadPhoto(
    photo: SpypointPhoto | string,
    opts: { size?: SpypointPhotoSize } = {},
  ): Promise<Uint8Array> {
    const size = opts.size ?? "medium";
    const url = typeof photo === "string" ? photo : photoUrl(photo, size);
    if (!url) throw new Error(`No URL available for size "${size}"`);
    const response = await this.fetchFn(url, { method: "GET" });
    if (!response.ok) throw new SpypointApiError(response);
    return new Uint8Array(await response.arrayBuffer());
  }

  private async get(path: string): Promise<Response> {
    await this.authenticate();
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: { ...this.headers },
    });
    this.raiseOnError(response);
    return response;
  }

  private async post(path: string, body: unknown): Promise<Response> {
    await this.authenticate();
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { ...this.headers },
      body: JSON.stringify(body),
    });
    this.raiseOnError(response);
    return response;
  }

  private raiseOnError(response: Response): void {
    if (response.status === 401) {
      this.expiresAt = new Date(Date.now() - 1000);
      delete this.headers.Authorization;
    }
    if (!response.ok) throw new SpypointApiError(response);
  }
}

export function createSpypointClient(): SpypointClient {
  const email = process.env.SPYPOINT_EMAIL;
  const password = process.env.SPYPOINT_PASSWORD;
  if (!email || !password) {
    throw new Error("SPYPOINT_EMAIL and SPYPOINT_PASSWORD must be set");
  }
  return new SpypointClient(email, password);
}
