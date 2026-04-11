"use client";

import Link from "next/link";
import FavoriteButton from "../favorite-button";
import SubscribeButton from "../subscribe-button";
import StatusPill from "./status-pill";
import type { StationCard } from "./types";
import { timeAgo, statusLabel } from "./utils";

interface RiverListItemProps {
  card: StationCard;
  isAdmin?: boolean;
  isSubscribed?: boolean;
  onNeedEmail?: () => void;
  onToggled?: () => void;
  isNative?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export default function RiverListItem({
  card,
  isAdmin = false,
  isSubscribed = false,
  onNeedEmail,
  onToggled,
  isNative = false,
  t,
}: RiverListItemProps) {
  return (
    <Link
      href={`/rivers/${card.id}`}
      className={`group flex flex-col gap-1 rounded-lg bg-background px-4 py-3 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:gap-4 ${
        card.isGoodRange ? "border-2" : "border border-foreground/40"
      }`}
      style={
        card.isGoodRange
          ? { borderColor: card.color, boxShadow: `0 0 8px ${card.color}20` }
          : undefined
      }
    >
      {/* Row 1: name + status */}
      <div className="flex min-w-0 items-center gap-2 sm:flex-1">
        <span
          className="h-3 w-3 flex-shrink-0 rounded-full"
          style={{
            backgroundColor:
              card.status !== "unknown" ? card.color : "transparent",
          }}
        />
        <h2 className="truncate text-sm font-semibold group-hover:underline">
          {card.name}
        </h2>
        {card.rapidClass && (
          <span className="flex-shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-white dark:bg-zinc-200 dark:text-zinc-900">
            {card.rapidClass}
          </span>
        )}
        {card.municipality && (
          <span className="hidden text-xs text-foreground/40 sm:inline">
            {card.municipality}
          </span>
        )}
        {card.status !== "unknown" && (
          <span
            className="flex-shrink-0 text-xs font-medium"
            style={{ color: card.color }}
          >
            {statusLabel(card.status, t)}
          </span>
        )}
        <StatusPill card={card} t={t} />
      </div>

      {/* Row 2: flow + controls */}
      <div className="flex items-center gap-3 pl-5 sm:pl-0">
        {isAdmin && (
          <p className="hidden text-xs text-foreground/50 sm:block">
            {card.id}
            {card.catchmentArea !== undefined && (
              <span>
                {" "}
                &middot; {Number(card.catchmentArea).toLocaleString("en-US")}{" "}
                km&sup2;
              </span>
            )}
          </p>
        )}

        {/* Gradient bar (compact) */}
        {card.status !== "unknown" && card.lastFlow != null && (
          <div className="hidden w-24 flex-shrink-0 sm:block">
            <div
              className="relative h-1.5 w-full overflow-hidden rounded-full"
              style={{
                background:
                  "linear-gradient(to right, #6A9FD8, #3B82F6 45%, #3A4FBF 60%, #5C3DAF 75%, #8B2E90 88%, #D32F2F)",
              }}
            >
              <div
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md dark:border-zinc-900"
                style={{
                  left: `${Math.max(0, Math.min(100, card.position * 100))}%`,
                  backgroundColor: "#22c55e",
                }}
              />
            </div>
          </div>
        )}

        {/* Flow value */}
        <div className="flex-shrink-0">
          {card.lastFlow != null ? (
            <p className="text-base font-bold tabular-nums sm:text-lg">
              {card.lastFlow.toFixed(1)}{" "}
              <span className="text-xs font-normal text-foreground/60">
                m&sup3;/s
              </span>
            </p>
          ) : (
            <p className="text-xs text-foreground/40">{t("app.noData")}</p>
          )}
        </div>
        {card.forecastAt && (
          <span className="text-[10px] text-foreground/40">
            {timeAgo(card.forecastAt, t)}
          </span>
        )}

        <div className="ml-auto flex flex-shrink-0 gap-0.5">
          {onNeedEmail && onToggled && (
            <SubscribeButton
              stationId={card.id}
              isSubscribed={isSubscribed}
              onNeedEmail={onNeedEmail}
              onToggled={onToggled}
              isNative={isNative}
            />
          )}
          <FavoriteButton stationId={card.id} />
        </div>
      </div>
    </Link>
  );
}
