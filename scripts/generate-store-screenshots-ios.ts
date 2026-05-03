/**
 * Generate App Store screenshots from the live production site.
 *
 *   npm run store:screenshots:ios
 *
 * Uses a 6.9" iPhone viewport (440×956 CSS @ 3x DPR → 1320×2868 PNGs),
 * which is the size Apple requires for new App Store submissions.
 *
 * Environment variables:
 *   STORE_SITE_URL   Override the target site (default: production).
 *   STORE_LOCALE     Output locale dir under ios/fastlane/screenshots
 *                    (default: fr-CA — matches App Store Connect primary language).
 */

import { chromium, devices } from "@playwright/test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const SITE_URL = process.env.STORE_SITE_URL ?? "https://www.flowcast.ca/";
const LOCALE = process.env.STORE_LOCALE ?? "fr-CA";
const OUT_DIR = join(process.cwd(), "ios", "fastlane", "screenshots", LOCALE);

// Map App Store locale (fr-CA, en-US, …) → app i18n key ("en" | "fr").
const APP_LANG = LOCALE.startsWith("fr") ? "fr" : "en";

// 6.9" iPhone (iPhone 16 Pro Max) — 1320×2868 PNG output.
// Built from Playwright's iPhone 14 Pro Max with the viewport bumped.
const IPHONE_69 = {
  ...devices["iPhone 14 Pro Max"],
  viewport: { width: 440, height: 956 },
  screen: { width: 440, height: 956 },
  deviceScaleFactor: 3,
};

// 13" iPad Pro (M4) — 2064×2752 PNG output (App Store required size).
// Built from Playwright's iPad Pro 11 with viewport/DPR set for the 13" target.
const IPAD_13 = {
  ...devices["iPad Pro 11"],
  viewport: { width: 1032, height: 1376 },
  screen: { width: 1032, height: 1376 },
  deviceScaleFactor: 2,
};

type DeviceSpec = {
  key: string;
  context: typeof IPHONE_69;
};

const DEVICES: DeviceSpec[] = [
  { key: "iphone69", context: IPHONE_69 },
  { key: "ipad13", context: IPAD_13 },
];

type PageSpec = {
  slug: string;
  storage?: Record<string, string>;
  prepare: (page: import("@playwright/test").Page) => Promise<void>;
};

const PAGES: PageSpec[] = [
  {
    slug: "home",
    storage: { "waterflow-active-tab": "explore" },
    prepare: async (page) => {
      await page.goto(SITE_URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
    },
  },
  {
    slug: "river_detail",
    storage: { "waterflow-active-tab": "explore" },
    prepare: async (page) => {
      await page.goto(SITE_URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      // Dismiss any onboarding/CTA modal that may intercept the click.
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(300);
      const firstRiver = page.locator('a[href^="/rivers/"]').first();
      await firstRiver.waitFor({ state: "visible", timeout: 15000 });
      await firstRiver.click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
    },
  },
  {
    slug: "river_detail_map",
    storage: { "waterflow-active-tab": "explore" },
    prepare: async (page) => {
      await page.goto(SITE_URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      // Dismiss any onboarding/CTA modal that may intercept the click.
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(300);
      const firstRiver = page.locator('a[href^="/rivers/"]').first();
      await firstRiver.waitFor({ state: "visible", timeout: 15000 });
      await firstRiver.click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      await page.evaluate(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
      });
      await page.waitForTimeout(100);
      await page.evaluate(() => {
        window.scrollBy({ top: -50, behavior: "instant" });
      });
      await page.waitForTimeout(3000);
    },
  },
  {
    slug: "map",
    storage: {
      "waterflow-active-tab": "map",
      "waterflow-map-view": JSON.stringify({ lat: 48.45, lon: -70.9, zoom: 10 }),
      // Default ("Street") uses OSM France tiles which render very pale/grey for rural areas.
      // "OSM" is the standard colorful base layer — much more legible for a store screenshot.
      "waterflow-map-layer": "OSM",
    },
    prepare: async (page) => {
      await page.goto(SITE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForSelector(".leaflet-container", { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2000);
      await page.evaluate(() => window.dispatchEvent(new Event("resize")));
      await page.waitForTimeout(1500);
      // Wait for the OSM base tiles to fully decode.
      await page.waitForFunction(
        () => {
          const tiles = Array.from(document.querySelectorAll(".leaflet-tile")) as HTMLImageElement[];
          if (tiles.length < 6) return false;
          return tiles.every((t) => t.complete && t.naturalWidth > 0);
        },
        { timeout: 45000 }
      ).catch(() => {});
      // Final settle for any straggler tiles + fade-in transitions.
      await page.waitForTimeout(4000);
    },
  },
];

async function main() {
  console.log(`→ Generating iOS screenshots from ${SITE_URL}`);
  console.log(`→ Output: ${OUT_DIR}`);

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const device of DEVICES) {
      console.log(`→ Device: ${device.key}`);
      for (let i = 0; i < PAGES.length; i++) {
        const spec = PAGES[i];
        console.log(`  [${i + 1}/${PAGES.length}] ${spec.slug}`);

        const ctx = await browser.newContext({
          ...device.context,
          colorScheme: "light",
          locale: LOCALE,
        });
        const storage: Record<string, string> = {
          "flowcast-locale": APP_LANG,
          // Skip the first-launch onboarding tour so it doesn't intercept clicks/screenshots.
          "flowcast-onboarding-seen": "1",
          ...spec.storage,
        };
        const entries = Object.entries(storage);
        await ctx.addInitScript((seed) => {
          for (const [k, v] of seed) {
            try { localStorage.setItem(k, v); } catch {}
          }
        }, entries);
        const page = await ctx.newPage();
        try {
          await spec.prepare(page);
          const file = join(OUT_DIR, `${device.key}_${i + 1}_${spec.slug}.png`);
          await page.screenshot({ path: file, fullPage: false });
          console.log(`      ✓ ${file}`);
        } finally {
          await page.close();
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
