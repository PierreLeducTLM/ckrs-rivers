"use client";

import type { StationCard } from "./types";
import { computeCardStatusInfo, STATUS_PILL_COLORS } from "./utils";

export default function StatusPill({
  card,
  t,
}: {
  card: StationCard;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const info = computeCardStatusInfo(card);
  if (!info) return null;
  const style = STATUS_PILL_COLORS[info.key] ?? {
    bg: "rgba(113,113,122,0.12)",
    text: "#71717a",
  };
  const text =
    info.param != null ? t(info.key, { n: info.param }) : t(info.key);
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {text}
    </span>
  );
}
