/**
 * Generate Play Store phone screenshots from the live production site.
 *
 *   npm run store:screenshots
 *
 * Uses Playwright's Pixel 7 descriptor (412×915 CSS, DPR 2.625), which
 * produces ~1080×2400 PNGs — well within Play Store's 320–3840 px phone
 * screenshot range.
 *
 * Environment variables:
 *   STORE_SITE_URL   Override the target site (default: production Vercel URL)
 *   STORE_LOCALE     Override output locale dir (default: en-US)
 */

import { chromium, devices } from "@playwright/test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const SITE_URL = process.env.STORE_SITE_URL ?? "https://water-flow-eight.vercel.app";
const LOCALE = process.env.STORE_LOCALE ?? "en-US";
const OUT_DIR = join(
  process.cwd(),
  "fastlane",
  "metadata",
  "android",
  LOCALE,
  "images",
  "phoneScreenshots",
);

// Map Play Store locale (en-US, fr-CA, …) → app i18n key ("en" | "fr").
// The app reads "flowcast-locale" from localStorage.
const APP_LANG = LOCALE.startsWith("fr") ? "fr" : "en";

type PageSpec = {
  slug: string;
  /** localStorage entries to seed *before* navigation (per-shot). */
  storage?: Record<string, string>;
  /**
   * Navigate to a page and get it ready for a screenshot.
   * Receives a Playwright Page and should leave it in the final pre-shot state.
   */
  prepare: (page: import("@playwright/test").Page) => Promise<void>;
};

const PAGES: PageSpec[] = [
  {
    slug: "home",
    // Force the Explore tab so the shot always shows the station list
    // (first-time visitors see this; returning users may have "My Rivers"
    // selected via localStorage, which would show an empty state).
    storage: { "waterflow-active-tab": "explore" },
    prepare: async (page) => {
      await page.goto(SITE_URL, { waitUntil: "networkidle" });
      // Give client-side hydration + any map/chart a beat to settle.
      await page.waitForTimeout(1500);
    },
  },
  {
    slug: "river_detail",
    storage: { "waterflow-active-tab": "explore" },
    prepare: async (page) => {
      await page.goto(SITE_URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      // Click the first river/station link. The home page links detail
      // pages as /rivers/<id> — grab the first one we can find.
      const firstRiver = page.locator('a[href^="/rivers/"]').first();
      await firstRiver.waitFor({ state: "visible", timeout: 15000 });
      await firstRiver.click();
      await page.waitForLoadState("networkidle");
      // Charts take a moment to render.
      await page.waitForTimeout(2000);
    },
  },
  {
    slug: "river_detail_map",
    storage: { "waterflow-active-tab": "explore" },
    prepare: async (page) => {
      await page.goto(SITE_URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      const firstRiver = page.locator('a[href^="/rivers/"]').first();
      await firstRiver.waitFor({ state: "visible", timeout: 15000 });
      await firstRiver.click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      // Scroll to the bottom, then back up a bit to frame the river path
      // map + put-in/takeout section nicely.
      await page.evaluate(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
      });
      await page.waitForTimeout(100);
      await page.evaluate(() => {
        window.scrollBy({ top: -50, behavior: "instant" });
      });
      // Give Leaflet tiles time to load after scroll.
      await page.waitForTimeout(3000);
    },
  },
  {
    slug: "map",
    storage: {
      "waterflow-active-tab": "map",
      // Zoom into the Saguenay / Lac-Saint-Jean river cluster so station
      // markers are clearly visible instead of the full-Quebec overview.
      "waterflow-map-view": JSON.stringify({ lat: 48.45, lon: -70.9, zoom: 10 }),
    },
    prepare: async (page) => {
      await page.goto(SITE_URL, { waitUntil: "networkidle" });
      // Leaflet tiles need time to fetch and paint at the zoomed level.
      await page.waitForTimeout(4000);
    },
  },
];

async function main() {
  console.log(`→ Generating screenshots from ${SITE_URL}`);
  console.log(`→ Output: ${OUT_DIR}`);

  // Wipe existing screenshots so stale files can't linger into a release.
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();

  try {
    for (let i = 0; i < PAGES.length; i++) {
      const spec = PAGES[i];
      console.log(`  [${i + 1}/${PAGES.length}] ${spec.slug}`);

      // Fresh context per shot so localStorage seeds don't leak between pages.
      const ctx = await browser.newContext({
        ...devices["Pixel 7"],
        colorScheme: "light",
        locale: LOCALE,
      });
      // Merge per-shot storage with the global language seed.
      const storage: Record<string, string> = {
        "flowcast-locale": APP_LANG,
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
        const file = join(OUT_DIR, `${i + 1}_${spec.slug}.png`);
        await page.screenshot({ path: file, fullPage: false });
        console.log(`      ✓ ${file}`);
      } finally {
        await page.close();
        await ctx.close();
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
