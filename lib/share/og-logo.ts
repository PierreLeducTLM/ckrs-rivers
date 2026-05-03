import { promises as fs } from "node:fs";
import path from "node:path";

let cachedDataUrl: Promise<string> | null = null;

export function getFlowcastLogoDataUrl(): Promise<string> {
  if (!cachedDataUrl) {
    cachedDataUrl = loadLogo();
  }
  return cachedDataUrl;
}

async function loadLogo(): Promise<string> {
  const logoPath = path.join(process.cwd(), "public", "logo2.png");
  const buffer = await fs.readFile(logoPath);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}
