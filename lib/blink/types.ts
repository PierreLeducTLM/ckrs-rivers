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
  type: BlinkCameraType;
  model: string | null;
  // Relative thumbnail path returned by the homescreen e.g.
  //   "/api/v3/media/accounts/123/networks/456/owls/789/thumbnail/thumbnail.jpg"
  // We append ".jpg" + a ts query and prepend the tier host.
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

export class BlinkTwoFARequiredError extends Error {
  constructor() {
    super("Blink two-factor authentication required. Check email for pin.");
    this.name = "BlinkTwoFARequiredError";
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
