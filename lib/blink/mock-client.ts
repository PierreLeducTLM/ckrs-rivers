// Minimal stand-in for BlinkClient used when BLINK_MOCK=1. Lets the admin
// flow be exercised end-to-end without a real Blink account or having to
// drive a 2FA email pin in dev. Returns a couple of fake cameras and
// downloads a placeholder image so the Vercel Blob + vision pipeline runs.

/* eslint-disable @typescript-eslint/no-unused-vars */

import type { BlinkCamera, BlinkTokens } from "./types";

const MOCK_TOKENS: BlinkTokens = {
  accessToken: "mock-access-token",
  refreshToken: "mock-refresh-token",
  expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  tierHost: "mock.immedia-semi.com",
  accountId: "mock-account-1",
  clientId: "mock-client-1",
};

export class BlinkMockClient {
  constructor(_session?: unknown, _options?: unknown) {}

  get tokens(): BlinkTokens {
    return MOCK_TOKENS;
  }

  async login(_password: string): Promise<BlinkTokens> {
    return MOCK_TOKENS;
  }

  async verifyTwoFactor(_password: string, _pin: string): Promise<BlinkTokens> {
    return MOCK_TOKENS;
  }

  async refresh(): Promise<BlinkTokens> {
    return MOCK_TOKENS;
  }

  async ensureValidToken(): Promise<BlinkTokens> {
    return MOCK_TOKENS;
  }

  async listCameras(): Promise<BlinkCamera[]> {
    const now = new Date();
    return [
      {
        id: "mock-blink-cam-1",
        networkId: "mock-net-1",
        name: "Mock Blink Outdoor (test)",
        type: "default",
        model: "Blink Outdoor 4",
        thumbnailPath: "https://placehold.co/640x480/png?text=Mock+Blink+River",
        thumbnailUpdatedAt: now,
      },
    ];
  }

  async snapPicture(camera: Pick<BlinkCamera, "id" | "networkId" | "type">): Promise<{ networkId: number | string; commandId: number | string }> {
    return { networkId: camera.networkId, commandId: "mock-cmd-1" };
  }

  async waitForCommand(_networkId: number | string, _commandId: number | string): Promise<boolean> {
    return true;
  }

  async fetchThumbnail(camera: BlinkCamera): Promise<Uint8Array> {
    const url = camera.thumbnailPath ?? "https://placehold.co/640x480/png?text=Mock+Blink+River";
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Mock thumbnail fetch failed: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }
}
