"use client";

import Link from "next/link";
import FavoriteButton from "../favorite-button";
import SubscribeButton from "../subscribe-button";
import StatusPill from "./status-pill";
import FlowTendency from "./flow-tendency";
import { useTab } from "./tab-context";
import type { StationCard } from "./types";
import { computeDisplayState, statusLabel } from "./utils";

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
  const { timeTravelTs } = useTab();
  const projected =
    timeTravelTs != null ? computeDisplayState(card, timeTravelTs) : null;
  const displayFlow = projected ? projected.flow : card.lastFlow;
  const displayColor = projected ? projected.color : card.color;
  const displayStatus = projected ? projected.status : card.status;
  const displayIsGood = projected ? projected.isGoodRange : card.isGoodRange;
  const displayPosition = projected ? projected.position : card.position;
  const isProjected = projected != null;

  return (
    <Link
      href={`/rivers/${card.id}`}
      className={`group flex flex-col gap-1 rounded-lg bg-background px-4 py-3 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:gap-4 ${
        displayStatus !== "unknown" ? "border-2" : "border border-foreground/40"
      } ${isProjected ? "ring-2 ring-amber-400/40" : ""}`}
      style={
        displayStatus !== "unknown"
          ? {
              borderColor: displayColor,
              boxShadow: displayIsGood ? `0 0 8px ${displayColor}20` : undefined,
            }
          : undefined
      }
    >
      {/* Row 1: name + status */}
      <div className="flex min-w-0 items-center gap-2 sm:flex-1">
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
      </div>

      {/* Row 2: flow + controls */}
      <div className="flex items-center gap-3">
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

        {/* Flow value */}
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {displayFlow != null ? (
            <>
              <span
                className="inline-block rounded-full px-2.5 py-1 text-sm font-bold tabular-nums leading-none sm:text-base"
                style={{
                  backgroundColor:
                    displayStatus !== "unknown" && displayColor
                      ? displayColor
                      : "#71717a",
                  color: "#fff",
                }}
              >
                {displayFlow.toFixed(1)}
                <span className="ml-1 text-[10px] font-semibold opacity-90">
                  m&sup3;/s
                </span>
              </span>
              {!isProjected && <FlowTendency trend={card.trend} />}
            </>
          ) : (
            <p className="text-xs text-foreground/40">{t("app.noData")}</p>
          )}
        </div>
        {isProjected && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            {t("timeTravel.projected")}
          </span>
        )}
        {isProjected ? (
          <span
            className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
            style={{ backgroundColor: `${displayColor}22`, color: displayColor }}
          >
            {statusLabel(displayStatus, t)}
          </span>
        ) : (
          <StatusPill card={card} t={t} />
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

      {/* Row 3 (mobile only): flow progress bar */}
      {displayFlow != null && (
        <div className="sm:hidden">
          <div
            className="relative h-1.5 w-full overflow-hidden rounded-full"
            style={{
              background:
                displayIsGood || displayStatus === "too-high"
                  ? "linear-gradient(to right, #4ADE80, #16A34A 50%, #16A34A 70%, #FACC15 80%, #D32F2F)"
                  : "#a1a1aa",
            }}
          >
            {(displayIsGood || displayStatus === "too-high") && (
              <div
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md dark:border-zinc-900"
                style={{
                  left: `${Math.max(0, Math.min(100, displayPosition * 100))}%`,
                  backgroundColor: displayColor,
                }}
              />
            )}
          </div>
        </div>
      )}
    </Link>
  );
}
