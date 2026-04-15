"use client";

/**
 * Compact river card rendered inline in chat answers.
 *
 * Tool outputs (from lib/ai/tools.ts) flow into this component. Because the
 * three tools return slightly different shapes, we accept a permissive input
 * and only render the fields that are present.
 */

import Link from "next/link";

export interface ChatCardInput {
  id: string;
  name: string;
  municipality?: string | null;
  currentFlow?: number | null;
  paddlingStatus?: string;
  distanceKm?: number | null;
  rapidClass?: string | null;
  paddling?: { min?: number; ideal?: number; max?: number } | null;
  trendDirection?: string;
  runnableWindowDays?: number | null;
  forecastEntersRange?: boolean;
  forecastEntersRangeInDays?: number | null;
  forecastExitsRange?: boolean;
  forecastExitsRangeInHours?: number | null;
  bestUpcomingDay?: {
    date: string;
    flow?: number;
    paddlingStatus?: string;
  } | null;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: Record<"en" | "fr", string> }> = {
  ideal: {
    bg: "rgba(16,185,129,0.12)",
    text: "#059669",
    label: { en: "Ideal", fr: "Ideal" },
  },
  runnable: {
    bg: "rgba(59,130,246,0.12)",
    text: "#2563eb",
    label: { en: "Runnable", fr: "Navigable" },
  },
  "too-low": {
    bg: "rgba(113,113,122,0.12)",
    text: "#71717a",
    label: { en: "Too Low", fr: "Trop bas" },
  },
  "too-high": {
    bg: "rgba(239,68,68,0.12)",
    text: "#dc2626",
    label: { en: "Too High", fr: "Trop haut" },
  },
  unknown: {
    bg: "rgba(113,113,122,0.08)",
    text: "#a1a1aa",
    label: { en: "Unknown", fr: "Inconnu" },
  },
};

function trendIcon(trend?: string): string | null {
  switch (trend) {
    case "rising":
      return "▲";
    case "falling":
      return "▼";
    case "stable":
      return "→";
    default:
      return null;
  }
}

export default function ChatRiverCard({
  data,
  locale,
}: {
  data: ChatCardInput;
  locale: "en" | "fr";
}) {
  const status = data.paddlingStatus ?? "unknown";
  const statusStyle = STATUS_STYLES[status] ?? STATUS_STYLES.unknown;
  const flow = data.currentFlow;

  // Choose the most informative secondary line:
  // 1. Distance if provided (near-me queries)
  // 2. "Runnable X/Y days" if in range with upcoming window
  // 3. "Runnable in Nd" if out of range but entering
  // 4. Municipality fallback
  const secondaryLine = (() => {
    const parts: string[] = [];
    if (data.distanceKm != null) {
      parts.push(
        locale === "fr"
          ? `${data.distanceKm.toFixed(1)} km`
          : `${data.distanceKm.toFixed(1)} km away`,
      );
    }
    if (data.municipality) {
      parts.push(data.municipality);
    }
    if (
      data.forecastEntersRange &&
      data.forecastEntersRangeInDays != null &&
      status !== "runnable" &&
      status !== "ideal"
    ) {
      parts.push(
        locale === "fr"
          ? `navigable dans ~${data.forecastEntersRangeInDays}j`
          : `runnable in ~${data.forecastEntersRangeInDays}d`,
      );
    } else if (
      (status === "runnable" || status === "ideal") &&
      data.runnableWindowDays != null &&
      data.runnableWindowDays > 0
    ) {
      const n = data.runnableWindowDays;
      parts.push(
        locale === "fr"
          ? `${n} jour${n > 1 ? "s" : ""} navigable`
          : `${n} runnable day${n > 1 ? "s" : ""}`,
      );
    } else if (
      data.forecastExitsRange &&
      data.forecastExitsRangeInHours != null &&
      data.forecastExitsRangeInHours <= 48
    ) {
      parts.push(
        locale === "fr"
          ? `sortie ~${data.forecastExitsRangeInHours}h`
          : `dropping out ~${data.forecastExitsRangeInHours}h`,
      );
    }
    return parts.join(" · ");
  })();

  const best = data.bestUpcomingDay;

  return (
    <Link
      href={`/rivers/${data.id}`}
      className="group flex flex-col gap-1 rounded-lg border border-foreground/15 bg-background px-3 py-2 text-[13px] shadow-sm transition hover:border-brand/40 hover:shadow-md"
    >
      {/* Row 1: name + class */}
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="truncate font-semibold group-hover:underline">{data.name}</h3>
        {data.rapidClass && (
          <span className="flex-shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-white dark:bg-zinc-200 dark:text-zinc-900">
            {data.rapidClass}
          </span>
        )}
      </div>

      {/* Row 2: flow + status pill */}
      <div className="flex items-center gap-2">
        <p className="text-base font-bold tabular-nums">
          {flow != null ? flow.toFixed(1) : "—"}{" "}
          <span className="text-[11px] font-normal text-foreground/60">m³/s</span>
        </p>
        {trendIcon(data.trendDirection) && (
          <span className="text-[11px] text-foreground/50">
            {trendIcon(data.trendDirection)}
          </span>
        )}
        <span
          className="ml-auto inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
          style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
        >
          {statusStyle.label[locale]}
        </span>
      </div>

      {/* Row 3: secondary info */}
      {secondaryLine && (
        <p className="truncate text-[11px] text-foreground/55">{secondaryLine}</p>
      )}

      {/* Row 4: best upcoming day (favorites view) */}
      {best && (
        <p className="text-[11px] text-foreground/55">
          {locale === "fr" ? "Meilleur jour" : "Best day"}:{" "}
          <span className="font-medium text-foreground/75">{best.date}</span>
          {best.flow != null && (
            <> · {best.flow.toFixed(1)} m³/s</>
          )}
          {best.paddlingStatus && STATUS_STYLES[best.paddlingStatus] && (
            <> · {STATUS_STYLES[best.paddlingStatus].label[locale]}</>
          )}
        </p>
      )}
    </Link>
  );
}

/**
 * Best-effort normalizer: given a tool output (single object OR array OR
 * object with `error`), extract an array of card-ready entries. Returns
 * an empty array if the output doesn't look like river data.
 */
export function extractCardsFromToolOutput(output: unknown): ChatCardInput[] {
  if (output == null) return [];

  // Error payload
  if (typeof output === "object" && output !== null && "error" in (output as Record<string, unknown>)) {
    return [];
  }

  const maybeArray = Array.isArray(output) ? output : [output];
  const cards: ChatCardInput[] = [];
  for (const item of maybeArray) {
    if (item && typeof item === "object" && "id" in item && "name" in item) {
      cards.push(item as ChatCardInput);
    }
  }
  return cards;
}
