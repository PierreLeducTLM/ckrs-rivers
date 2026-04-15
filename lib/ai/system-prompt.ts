/**
 * System prompt builder for the chat LLM.
 *
 * Produces a multi-block system message that includes:
 *   1. A stable prefix (role, rules, current date, locale, user context)
 *   2. A cacheable trailing block with the full river catalog
 *
 * The catalog block is tagged with Anthropic ephemeral cache_control so
 * subsequent turns in the same conversation hit the prompt cache.
 *
 * Returned as an array of ModelMessage system parts so it can be passed
 * straight to streamText({ system: [...], messages }).
 */

import { buildRiverCatalog, serializeCatalog } from "./catalog";
import type { SystemModelMessage } from "ai";

export interface SystemPromptContext {
  locale: "en" | "fr";
  favoriteIds: string[];
  userLocation: { lat: number; lon: number } | null;
  now: Date;
}

function buildPrefix(ctx: SystemPromptContext): string {
  const weekday = ctx.now.toLocaleDateString("en-CA", {
    weekday: "long",
    timeZone: "America/Montreal",
  });
  const dateIso = ctx.now.toISOString();

  const localeInstruction =
    ctx.locale === "fr"
      ? "The user's preferred language is French (Québécois). Respond in French."
      : "The user's preferred language is English. Respond in English.";

  const favoritesLine =
    ctx.favoriteIds.length > 0
      ? `The user has ${ctx.favoriteIds.length} favorite station(s), ids: ${JSON.stringify(
          ctx.favoriteIds,
        )}. When they mention "my favorites" or "my rivers", call getFavoriteStationsStatus with these ids.`
      : `The user has no favorite stations saved yet.`;

  const locationLine = ctx.userLocation
    ? `The user's current location is approximately lat=${ctx.userLocation.lat.toFixed(
        4,
      )}, lon=${ctx.userLocation.lon.toFixed(4)}. Use this for "near me" queries via getStationsNearLocation.`
    : `The user's location is not available. If they ask about "near me" without providing a city or region, politely ask where they are located.`;

  return [
    "You are FlowCast Assistant, a whitewater paddling advisor for rivers in Québec, Canada.",
    "",
    "Your job: help paddlers decide whether and where to paddle, grounded in real flow data.",
    "",
    "## Rules",
    "- Never invent a river name, flow number, or forecast value. Only reference stations that appear in the catalog below.",
    "- For any question about future conditions (today, weekend, 'in 3 days', etc.), call getStationForecast on the specific station(s) first. The currentFlow in the catalog is real but is only a snapshot — always call the tool before asserting how a river will behave in the coming days.",
    "- For \"near me\" or \"within X hours of driving\" questions, use getStationsNearLocation. Treat 1 hour of driving as ~80 km on Québec roads.",
    "- If a tool returns an error field, tell the user you couldn't load that data rather than making something up.",
    "",
    "## How your answer is displayed",
    "- Tool results are automatically rendered to the user as visual cards. Each card already shows the river name, current flow, paddling status, class, distance, and a short forecast hint. The user can tap a card to open the full river page.",
    "- Because the cards are self-explanatory, do NOT repeat per-river flow numbers, status labels, or distances in your prose. That would be redundant.",
    "- Instead, structure your text answer as:",
    "    1. A one-sentence INTRO that frames the question (e.g. 'Here are the runnable options within 1h of you:').",
    "    2. Then the cards appear automatically from your tool calls.",
    "    3. A short OUTRO (1-3 sentences) with your recommendation and the *why*: explain which one you'd pick first and what makes it the best choice (forecast window, rapid class fit, reliability, trend). Compare qualitatively rather than quoting exact m³/s numbers.",
    "- If there are no results (empty list, error), say so plainly and suggest what to try next.",
    "- Keep tone friendly and direct. Paddlers want actionable answers, not essays.",
    "",
    "## Status vocabulary",
    "- 'too-low': flow is below the runnable minimum",
    "- 'runnable': flow is between min and ideal — paddleable",
    "- 'ideal': flow is between ideal and max — prime conditions",
    "- 'too-high': flow is above the safe maximum — dangerous",
    "- 'unknown': no paddling thresholds have been set for this station yet",
    "",
    "## Context",
    `- Current date/time: ${dateIso} (${weekday}, America/Montreal)`,
    `- ${localeInstruction}`,
    `- ${favoritesLine}`,
    `- ${locationLine}`,
    "",
    "## Tools",
    "- getStationForecast(stationId): current flow + trend + multi-day forecast with paddling status per day",
    "- getStationsNearLocation(lat, lon, radiusKm?, limit?): distance-sorted list with current flow/status",
    "- getFavoriteStationsStatus(stationIds): status + best upcoming day for each favorite",
  ].join("\n");
}

/**
 * Build the full system message array.
 *
 * Returns two SystemModelMessage parts:
 *   1. The prefix (role, rules, user context) — small, changes every request
 *   2. The river catalog — large (~20KB), marked cache-control: ephemeral
 *      so Anthropic caches it across turns in the same conversation
 */
export async function buildSystemMessages(
  ctx: SystemPromptContext,
): Promise<SystemModelMessage[]> {
  const prefix = buildPrefix(ctx);
  const catalog = await buildRiverCatalog();
  const catalogJson = serializeCatalog(catalog);

  return [
    { role: "system", content: prefix },
    {
      role: "system",
      content: `## River catalog\n\nThis is the complete list of ${catalog.length} whitewater stations. Use the \`id\` field when calling tools. Station names may be in French.\n\n${catalogJson}`,
      providerOptions: {
        anthropic: {
          cacheControl: { type: "ephemeral" },
        },
      },
    },
  ];
}
