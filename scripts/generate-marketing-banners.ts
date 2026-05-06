/**
 * Generate 3 advertising banners (1200x630) for iOS, Android and Web.
 * Same layout for all three — only the download badge changes.
 *
 *   npx tsx scripts/generate-marketing-banners.ts
 *
 * Output: marketing/banner-{ios,android,web}.png
 */

import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const LOGO = join(ROOT, "public", "logo2.png");
const BADGE_IOS = join(ROOT, "marketing", "black.svg");
const BADGE_ANDROID = join(
  ROOT,
  "marketing",
  "GetItOnGooglePlay_Badge_Web_color_French-CA.png",
);
const BADGE_WEB = join(ROOT, "marketing", "web-app.png");

const TITLE = "FlowCast";
const TAGLINE = "Prévisions de débit pour kayakistes";
const SUBLINE = "Suivez les niveaux d'eau en temps réel sur vos rivières favorites.";

type Variant = {
  name: string;
  badgePath: string;
  badgeWidth: number;
};

const VARIANTS: Variant[] = [
  { name: "ios", badgePath: BADGE_IOS, badgeWidth: 360 },
  { name: "android", badgePath: BADGE_ANDROID, badgeWidth: 380 },
  { name: "web", badgePath: BADGE_WEB, badgeWidth: 380 },
];

const ALL_BADGES = [
  { path: BADGE_IOS, width: 180 },
  { path: BADGE_ANDROID, width: 190 },
  { path: BADGE_WEB, width: 190 },
];

type Layout = {
  suffix: string;
  W: number;
  H: number;
  logo: { width: number; height: number; left: number; top: number };
  textLayout: string;
  badge: { left: number; top: number; widthScale: number };
};

const LAYOUT_WIDE: Layout = {
  suffix: "",
  W: 1200,
  H: 630,
  logo: { width: 320, height: 480, left: 70, top: 75 },
  textLayout: "wide",
  badge: { left: 430, top: 0, widthScale: 1 },
};

const LAYOUT_SQUARE: Layout = {
  suffix: "-square",
  W: 1080,
  H: 1080,
  logo: { width: 360, height: 360, left: 360, top: 110 },
  textLayout: "square",
  badge: { left: 0, top: 0, widthScale: 1 },
};

const LAYOUT_STRIP: Layout = {
  suffix: "-strip",
  W: 1080,
  H: 540,
  logo: { width: 380, height: 380, left: 60, top: 80 },
  textLayout: "strip",
  badge: { left: 0, top: 0, widthScale: 1 },
};

function backgroundSvg(W: number, H: number): Buffer {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b3a82"/>
      <stop offset="55%" stop-color="#1e6fd9"/>
      <stop offset="100%" stop-color="#0fb5d6"/>
    </linearGradient>
    <radialGradient id="glow" cx="22%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <path d="M0,${H - 110} C${W * 0.18},${H - 160} ${W * 0.32},${H - 70} ${W * 0.5},${H - 110} C${W * 0.68},${H - 150} ${W * 0.82},${H - 70} ${W},${H - 120} L${W},${H} L0,${H} Z"
        fill="#ffffff" fill-opacity="0.08"/>
  <path d="M0,${H - 70} C${W * 0.22},${H - 110} ${W * 0.35},${H - 30} ${W * 0.55},${H - 70} C${W * 0.73},${H - 105} ${W * 0.85},${H - 30} ${W},${H - 65} L${W},${H} L0,${H} Z"
        fill="#ffffff" fill-opacity="0.10"/>
</svg>`;
  return Buffer.from(svg);
}

function textSvg(layout: Layout): Buffer {
  const { W, H } = layout;
  if (layout.textLayout === "strip") {
    return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <style>
    .title { font: 700 88px 'Helvetica Neue', Arial, sans-serif; fill: #ffffff; letter-spacing: -2px; }
    .tag   { font: 500 28px 'Helvetica Neue', Arial, sans-serif; fill: #e6f3ff; opacity: 0.95; }
  </style>
  <text x="490" y="220" class="title">${TITLE}</text>
  <text x="490" y="270" class="tag">${TAGLINE}</text>
</svg>`);
  }
  if (layout.textLayout === "square") {
    return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <style>
    .title { font: 700 130px 'Helvetica Neue', Arial, sans-serif; fill: #ffffff; letter-spacing: -3px; text-anchor: middle; }
    .tag   { font: 600 44px 'Helvetica Neue', Arial, sans-serif; fill: #ffffff; text-anchor: middle; }
    .sub   { font: 400 28px 'Helvetica Neue', Arial, sans-serif; fill: #e6f3ff; opacity: 0.92; text-anchor: middle; }
  </style>
  <text x="${W / 2}" y="600" class="title">${TITLE}</text>
  <text x="${W / 2}" y="670" class="tag">${TAGLINE}</text>
  <text x="${W / 2}" y="725" class="sub">${SUBLINE}</text>
</svg>`);
  }
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <style>
    .title { font: 700 96px 'Helvetica Neue', Arial, sans-serif; fill: #ffffff; letter-spacing: -2px; }
    .tag   { font: 600 36px 'Helvetica Neue', Arial, sans-serif; fill: #ffffff; }
    .sub   { font: 400 24px 'Helvetica Neue', Arial, sans-serif; fill: #e6f3ff; opacity: 0.92; }
  </style>
  <text x="430" y="220" class="title">${TITLE}</text>
  <text x="430" y="280" class="tag">${TAGLINE}</text>
  <text x="430" y="335" class="sub">${SUBLINE}</text>
</svg>`);
}

async function buildBanner(variant: Variant, layout: Layout): Promise<void> {
  const out = join(ROOT, "marketing", `banner-${variant.name}${layout.suffix}.png`);
  const { W, H } = layout;

  const logoBuf = await sharp(LOGO)
    .resize({
      width: layout.logo.width,
      height: layout.logo.height,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const badgeWidth = Math.round(variant.badgeWidth * layout.badge.widthScale);
  const badgeInput = await readFile(variant.badgePath);
  const badgeBuf = await sharp(badgeInput)
    .resize({ width: badgeWidth, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const badgeMeta = await sharp(badgeBuf).metadata();
  const badgeH = badgeMeta.height ?? 120;

  let badgeLeft: number;
  let badgeTop: number;
  if (layout.textLayout === "square") {
    badgeLeft = Math.round((W - badgeWidth) / 2);
    badgeTop = H - badgeH - 110;
  } else if (layout.textLayout === "strip") {
    badgeLeft = 490;
    badgeTop = H - badgeH - 90;
  } else {
    badgeLeft = 430;
    badgeTop = H - badgeH - 70;
  }

  await sharp(backgroundSvg(W, H))
    .composite([
      { input: logoBuf, left: layout.logo.left, top: layout.logo.top },
      { input: textSvg(layout), left: 0, top: 0 },
      { input: badgeBuf, left: badgeLeft, top: badgeTop },
    ])
    .png({ compressionLevel: 9 })
    .toFile(out);

  console.log(`✓ ${out}`);
}

async function buildAllBanner(): Promise<void> {
  const W = 1080;
  const H = 540;
  const out = join(ROOT, "marketing", "banner-all-strip.png");

  const logoBuf = await sharp(LOGO)
    .resize({ width: 280, height: 280, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const textBuf = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <style>
    .title { font: 700 80px 'Helvetica Neue', Arial, sans-serif; fill: #ffffff; letter-spacing: -2px; }
    .tag   { font: 500 24px 'Helvetica Neue', Arial, sans-serif; fill: #e6f3ff; opacity: 0.95; }
    .pick  { font: 500 18px 'Helvetica Neue', Arial, sans-serif; fill: #ffffff; opacity: 0.85; text-anchor: middle; }
  </style>
  <text x="400" y="150" class="title">${TITLE}</text>
  <text x="400" y="195" class="tag">${TAGLINE}</text>
  <text x="${W / 2}" y="335" class="pick">Disponible sur</text>
</svg>`);

  const badges = await Promise.all(
    ALL_BADGES.map(async (b) => {
      const buf = await sharp(await readFile(b.path))
        .resize({ width: b.width, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      const meta = await sharp(buf).metadata();
      return { buf, w: b.width, h: meta.height ?? 60 };
    }),
  );

  const gap = 28;
  const rowWidth = badges.reduce((s, b) => s + b.w, 0) + gap * (badges.length - 1);
  const rowLeftStart = Math.round((W - rowWidth) / 2);
  const maxH = Math.max(...badges.map((b) => b.h));
  const rowTop = H - 50 - maxH;

  const composites = [
    { input: logoBuf, left: 80, top: 60 },
    { input: textBuf, left: 0, top: 0 },
  ];
  let cursor = rowLeftStart;
  for (const b of badges) {
    composites.push({
      input: b.buf,
      left: cursor,
      top: rowTop + Math.round((maxH - b.h) / 2),
    });
    cursor += b.w + gap;
  }

  if (rowWidth > W - 40) {
    console.warn(`⚠ badges row (${rowWidth}px) overflows banner — consider smaller widths`);
  }

  await sharp(backgroundSvg(W, H))
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(out);

  console.log(`✓ ${out}`);
}

async function main(): Promise<void> {
  for (const v of VARIANTS) {
    await buildBanner(v, LAYOUT_STRIP);
  }
  await buildAllBanner();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
