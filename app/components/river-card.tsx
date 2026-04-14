"use client";

import Link from "next/link";
import FavoriteButton from "../favorite-button";
import SubscribeButton from "../subscribe-button";
import StatusPill from "./status-pill";
import RelativeTime from "./relative-time";
import type { StationCard } from "./types";

interface RiverCardProps {
  card: StationCard;
  isAdmin: boolean;
  isSubscribed: boolean;
  onNeedEmail: () => void;
  onToggled: () => void;
  isNative: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export default function RiverCard({
  card,
  isAdmin,
  isSubscribed,
  onNeedEmail,
  onToggled,
  isNative,
  t,
}: RiverCardProps) {
  return (
    <Link
      href={`/rivers/${card.id}`}
      className={`group relative rounded-xl bg-background p-4 shadow transition-shadow hover:shadow-lg ${
        card.isGoodRange ? "border-2" : "border border-foreground/40"
      }`}
      style={
        card.isGoodRange
          ? { borderColor: card.color, boxShadow: `0 0 12px ${card.color}25` }
          : undefined
      }
    >
      {/* Header row: title + actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2 className="truncate text-base font-semibold leading-tight group-hover:underline">
            {card.name}
          </h2>
          {card.rapidClass && (
            <span className="flex-shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-white dark:bg-zinc-200 dark:text-zinc-900">
              {card.rapidClass}
            </span>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <SubscribeButton
            stationId={card.id}
            isSubscribed={isSubscribed}
            onNeedEmail={onNeedEmail}
            onToggled={onToggled}
            isNative={isNative}
          />
          <FavoriteButton stationId={card.id} />
        </div>
      </div>

      {/* Flow value row */}
      {card.lastFlow != null && (
        <div className="mt-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-base font-bold tabular-nums"
              style={{ backgroundColor: card.color, color: "#fff" }}
            >
              {card.lastFlow.toFixed(0)}
            </span>
            <span className="text-xs font-medium text-foreground/50">
              m&sup3;/s
            </span>
          </div>
          {card.forecastAt && (
            <RelativeTime
              isoDate={card.forecastAt}
              t={t}
              className="text-xs text-foreground/40"
            />
          )}
        </div>
      )}

      {isAdmin && (
        <p className="mt-0.5 text-xs text-foreground/50">
          Station {card.id}
          {card.catchmentArea !== undefined && (
            <span>
              {" "}
              &middot; {Number(card.catchmentArea).toLocaleString("en-US")}{" "}
              km&sup2;
            </span>
          )}
        </p>
      )}

      {/* Status pill */}
      {card.lastFlow != null ? (
        <div className="mt-2">
          <StatusPill card={card} t={t} />
        </div>
      ) : (
        <div className="mt-2 rounded-lg bg-foreground/5 px-3 py-2">
          <p className="text-xs text-foreground/40">{t("app.pressRefresh")}</p>
        </div>
      )}

      {/* Gradient bar */}
      {card.lastFlow != null && (
        <div className="mt-2">
          <div
            className="relative h-2 w-full overflow-hidden rounded-full"
            style={{
              background:
                card.isGoodRange || card.status === "too-high"
                  ? "linear-gradient(to right, #4ADE80, #16A34A 50%, #16A34A 80%, #D32F2F)"
                  : "#a1a1aa",
            }}
          >
            {/* Current position indicator — hidden when too-low or unknown */}
            {(card.isGoodRange || card.status === "too-high") && (
              <div
                className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-white shadow-lg transition-all duration-500 dark:border-zinc-900 ${
                  card.isGoodRange ? "animate-flow-pulse" : ""
                }`}
                style={{
                  left: `${Math.max(2, Math.min(98, card.position * 100))}%`,
                  backgroundColor: card.color,
                }}
              />
            )}
          </div>
          {/* Flow values below bar */}
          <div className="mt-1 flex justify-between text-[10px] font-medium tabular-nums text-foreground/50">
            <span>
              {card.paddling?.min != null ? `${card.paddling.min}` : "0"}
            </span>
            <span className="text-emerald-600 dark:text-emerald-400">
              {card.paddling?.ideal != null ? `${card.paddling.ideal}` : ""}
            </span>
            <span>
              {card.paddling?.max != null ? `${card.paddling.max}` : ""}
            </span>
          </div>
        </div>
      )}
    </Link>
  );
}
