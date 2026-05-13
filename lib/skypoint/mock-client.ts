import type {
  SpypointApi,
  SpypointCamera,
  SpypointPhoto,
  SpypointPhotoSize,
} from "./types";

// Two fake cameras that always show up in the "Available on Spypoint" list
// when SKYPOINT_MOCK=1. The names make the mock origin obvious in the UI.
const MOCK_CAMERAS: SpypointCamera[] = [
  {
    id: "mock-cam-1",
    name: "Mock River Cam (test)",
    model: "MOCK-LINK",
    lastUpdateTime: new Date(),
    isOnline: true,
  },
  {
    id: "mock-cam-2",
    name: "Mock Rapids Cam (test)",
    model: "MOCK-LINK",
    lastUpdateTime: new Date(),
    isOnline: true,
  },
];

// placehold.co always serves a valid JPEG, so the download path works end-to-end.
// The vision reader will report 'unreadable' (no real scale in the placeholder);
// admins can use the "manual override" input on the camera detail page to set a
// reading and exercise the runnability pill.
function mockImageUrl(cameraId: string, photoId: string): string {
  const text = `${cameraId}+%2F+${photoId}`;
  return `https://placehold.co/640x480/4a90d9/ffffff.jpg?text=${text}`;
}

function buildPhotos(cameraId: string, count: number): SpypointPhoto[] {
  // Most recent first; each photo 2h apart so the timeline looks plausible.
  const now = Date.now();
  return Array.from({ length: count }, (_, i): SpypointPhoto => {
    const id = `${cameraId}-photo-${i}-${now}`;
    const date = new Date(now - i * 2 * 60 * 60 * 1000);
    const host = "placehold.co";
    const path = `640x480/4a90d9/ffffff.jpg?text=${cameraId}+%2F+${id}`;
    return {
      id,
      cameraId,
      date,
      hd: false,
      small: { host, path },
      medium: { host, path },
      large: { host, path },
    };
  });
}

export class SpypointMockClient implements SpypointApi {
  async getCameras(): Promise<SpypointCamera[]> {
    return MOCK_CAMERAS.map((c) => ({ ...c, lastUpdateTime: new Date() }));
  }

  async getPhotos(opts: {
    cameras: Array<string | { id: string }>;
    limit?: number;
  }): Promise<SpypointPhoto[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? 3, 6));
    const cameraIds = opts.cameras.map((c) => (typeof c === "string" ? c : c.id));
    return cameraIds.flatMap((id) => buildPhotos(id, limit));
  }

  async downloadPhoto(
    photo: SpypointPhoto | string,
    _opts: { size?: SpypointPhotoSize } = {},
  ): Promise<Uint8Array> {
    const url =
      typeof photo === "string"
        ? photo
        : mockImageUrl(photo.cameraId ?? "mock", photo.id);
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) throw new Error(`Mock photo download failed: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }
}
