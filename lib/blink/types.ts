// Public-facing types for the Blink client. Kept small and deliberately
// independent of database rows; the account-store maps DB rows ↔ these.

export interface BlinkTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number; // ms epoch
  tierHost: string; // e.g. "u123.immedia-semi.com"
  accountId: number | string;
  clientId?: number | string | null;
}

// Camera "type" returned by the homescreen endpoint. Blink lumps several
// hardware lines into different URL prefixes ("owls" for the Mini cameras,
// "doorbells" for the video doorbell, the older direct paths for the
// XT/XT2/Outdoor). The Outdoor 4 currently maps to "default".
export type BlinkCameraType = "default" | "mini" | "doorbell";

export interface BlinkCamera {
  id: number | string;
  networkId: number | string;
  name: string;
  // Coarse family used to dispatch the snap action URL.
  type: BlinkCameraType;
  // Raw Blink product_type from /network/.../config — needed for the v3
  // media thumbnail URL ("catalina" for Outdoor 4, "owl" for Mini, etc.).
  productType: string | null;
  model: string | null;
  // Fully-formed thumbnail URL (or relative path to be joined against the
  // tier host). Already includes the `ts=...&ext=` query for new-API
  // cameras. Null if the config call didn't return a thumbnail.
  thumbnailPath: string | null;
  thumbnailUpdatedAt: Date | null;
}

export interface BlinkSnapshot {
  camera: BlinkCamera;
  // Synthetic photo id we use as the dedupe key in camera_images. Blink does
  // not give us a real id per still — we derive one from the thumbnail's
  // last-updated timestamp + camera id.
  photoId: string;
  capturedAt: Date;
  bytes: Uint8Array;
}

export class BlinkApiError extends Error {
  status: number;
  url: string;
  body: string | null;

  constructor(message: string, status: number, url: string, body: string | null = null) {
    super(message);
    this.name = "BlinkApiError";
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

// Transient state captured during the v2 OAuth signin step when Blink
// returns 412 (2FA required). Must be persisted across HTTP requests so
// the subsequent /verify-2fa call can replay the same session.
export interface BlinkPendingAuth {
  codeVerifier: string;
  csrfToken: string;
  // Session cookies as a flat name→value map. We only keep name=value
  // pairs (no expiry/path tracking) — sufficient for the short-lived
  // signin session.
  cookies: Record<string, string>;
}

export class BlinkTwoFARequiredError extends Error {
  pending: BlinkPendingAuth;

  constructor(pending: BlinkPendingAuth) {
    super("Blink two-factor authentication required. Check email for pin.");
    this.name = "BlinkTwoFARequiredError";
    this.pending = pending;
  }
}

export class BlinkInvalidCredentialsError extends Error {
  // The raw response body from Blink's token endpoint, when available.
  // Useful for distinguishing "wrong password" from rarer cases like
  // "account locked" or unexpected API shape changes.
  body: string | null;

  constructor(body: string | null = null) {
    super("Blink login failed: invalid credentials");
    this.name = "BlinkInvalidCredentialsError";
    this.body = body;
  }
}
