export interface SpypointCamera {
  id: string;
  name: string;
  model: string | null;
  lastUpdateTime: Date | null;
  isOnline: boolean;
}

export interface SpypointPhotoUrlSection {
  host: string;
  path: string;
}

export type SpypointPhotoSize = "small" | "medium" | "large";

export interface SpypointPhoto {
  id: string;
  cameraId: string | null;
  date: Date | null;
  hd: boolean | null;
  small: SpypointPhotoUrlSection | null;
  medium: SpypointPhotoUrlSection | null;
  large: SpypointPhotoUrlSection | null;
}

export function photoUrl(
  photo: SpypointPhoto,
  size: SpypointPhotoSize = "large",
): string | null {
  const section = photo[size];
  if (!section || !section.host || !section.path) return null;
  return `https://${section.host}/${section.path}`;
}

export class SpypointApiError extends Error {
  status: number;
  statusText: string;
  url: string;

  constructor(response: Response) {
    super(response.statusText || `HTTP ${response.status}`);
    this.name = "SpypointApiError";
    this.status = response.status;
    this.statusText = response.statusText;
    this.url = response.url;
  }
}

export class SpypointApiInvalidCredentialsError extends SpypointApiError {
  constructor(response: Response) {
    super(response);
    this.name = "SpypointApiInvalidCredentialsError";
  }
}
