import sharp from "sharp";
import { join } from "node:path";

const src = join(process.cwd(), "public", "logo2.png");

async function main() {
  const img = sharp(src).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });

  // Make near-white pixels transparent (threshold: RGB all > 240)
  const threshold = 240;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > threshold && g > threshold && b > threshold) {
      data[i + 3] = 0;
    }
  }

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(src);

  console.log(`Done: ${info.width}x${info.height}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
