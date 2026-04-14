/**
 * Generate the 512×512 Play Store hi-res icon from the in-app logo.
 *
 *   npm run store:icon
 *
 * Source: public/logo.png (1024×1024, committed to the repo).
 * Output: fastlane/metadata/android/<locale>/images/icon.png (512×512).
 *
 * Play Store requires PNG, 512×512, 32-bit with alpha, ≤1 MB.
 */

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const LOCALE = process.env.STORE_LOCALE ?? "en-US";
const SOURCE = join(process.cwd(), "public", "logo.png");
const OUT = join(
  process.cwd(),
  "fastlane",
  "metadata",
  "android",
  LOCALE,
  "images",
  "icon.png",
);

async function main() {
  console.log(`→ Source:  ${SOURCE}`);
  console.log(`→ Output:  ${OUT}`);

  await mkdir(dirname(OUT), { recursive: true });

  await sharp(SOURCE)
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(OUT);

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
