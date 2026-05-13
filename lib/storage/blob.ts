import { put } from "@vercel/blob";

export interface UploadResult {
  url: string;
  pathname: string;
}

export async function uploadCameraImage(
  cameraId: string,
  photoId: string,
  bytes: Uint8Array,
  contentType = "image/jpeg",
): Promise<UploadResult> {
  const pathname = `cameras/${cameraId}/${photoId}.jpg`;
  const blob = await put(pathname, Buffer.from(bytes), {
    access: "public",
    addRandomSuffix: false,
    contentType,
    allowOverwrite: true,
  });
  return { url: blob.url, pathname: blob.pathname };
}
