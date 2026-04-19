"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { useTranslation } from "@/lib/i18n/provider";
import RiverCard from "./river-card";
import RiverListItem from "./river-list-item";
import SortControl, { type SortMode } from "./sort-control";
import SortableRiver from "./sortable-river";
import TimeTravelToggle from "./time-travel-toggle";
import { useTab } from "./tab-context";
import type { StationCard } from "./types";
import { idealSortKey } from "./utils";
import { writeFavoritesList } from "../favorite-button";

const FAVORITES_KEY = "waterflow-favorites";
const VIEW_MODE_KEY = "waterflow-view-mode";
const SORT_MODE_KEY = "waterflow-sort-mode";

type ViewMode = "card" | "list";

function getFavoritesList(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

interface MyRiversTabProps {
  cards: StationCard[];
  isAdmin: boolean;
  subscribedStationIds: Set<string>;
  onNeedEmail: () => void;
  onToggled: () => void;
  isNative: boolean;
}

export default function MyRiversTab({
  cards,
  isAdmin,
  subscribedStationIds,
  onNeedEmail,
  onToggled,
  isNative,
}: MyRiversTabProps) {
  const { t } = useTranslation();
  const { setActiveTab } = useTab();
  const [favoriteOrder, setFavoriteOrder] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [sort, setSort] = useState<SortMode>("ideal");
  const [mounted, setMounted] = useState(false);

  const refreshFavorites = useCallback(() => {
    setFavoriteOrder(getFavoritesList());
  }, []);

  useEffect(() => {
    refreshFavorites();
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    if (saved === "card" || saved === "list") setViewMode(saved);
    const savedSort = localStorage.getItem(SORT_MODE_KEY);
    // Accept only current modes; legacy values ("status", "name") fall back to "ideal".
    if (savedSort === "ideal" || savedSort === "manual") setSort(savedSort);
    setMounted(true);
    window.addEventListener("favorites-changed", refreshFavorites);
    return () =>
      window.removeEventListener("favorites-changed", refreshFavorites);
  }, [refreshFavorites]);

  const toggleView = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  };

  const handleSortChange = (mode: SortMode) => {
    setSort(mode);
    localStorage.setItem(SORT_MODE_KEY, mode);
  };

  const favoriteSet = useMemo(() => new Set(favoriteOrder), [favoriteOrder]);

  const favoriteCards = useMemo(() => {
    const filtered = cards.filter((c) => favoriteSet.has(c.id));
    if (sort === "manual") {
      const indexById = new Map(favoriteOrder.map((id, i) => [id, i]));
      return [...filtered].sort((a, b) => {
        const ia = indexById.get(a.id);
        const ib = indexById.get(b.id);
        // Unknown IDs (shouldn't happen once filtered) sort to end by name.
        if (ia == null && ib == null) return a.name.localeCompare(b.name);
        if (ia == null) return 1;
        if (ib == null) return -1;
        return ia - ib;
      });
    }
    // "ideal" mode
    return [...filtered].sort((a, b) => {
      const ka = idealSortKey(a);
      const kb = idealSortKey(b);
      if (ka.group !== kb.group) return ka.group - kb.group;
      if (ka.score !== kb.score) return ka.score - kb.score;
      return a.name.localeCompare(b.name);
    });
  }, [cards, favoriteSet, favoriteOrder, sort]);

  // With the whole card draggable, activation constraints make sure a
  // quick tap/click still navigates to the river detail page. Only a
  // deliberate drag (mouse: 10px movement; touch: 250ms press) starts reorder.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = favoriteOrder.indexOf(String(active.id));
      const newIndex = favoriteOrder.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(favoriteOrder, oldIndex, newIndex);
      setFavoriteOrder(next);
      writeFavoritesList(next);
    },
    [favoriteOrder],
  );

  if (!mounted) return null;

  // Empty state
  if (favoriteCards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <svg
            className="h-8 w-8 text-amber-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold">{t("myRivers.empty")}</h2>
        <p className="mt-1 text-sm text-foreground/50">
          {t("myRivers.emptySubtext")}
        </p>
        <button
          onClick={() => setActiveTab("explore")}
          className="mt-4 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand/90"
        >
          {t("myRivers.exploreCta")}
        </button>
      </div>
    );
  }

  const isManual = sort === "manual";

  const renderCard = (card: StationCard) => (
    <RiverCard
      card={card}
      isAdmin={isAdmin}
      isSubscribed={subscribedStationIds.has(card.id)}
      onNeedEmail={onNeedEmail}
      onToggled={onToggled}
      isNative={isNative}
      t={t}
    />
  );

  const renderListItem = (card: StationCard) => (
    <RiverListItem
      card={card}
      isAdmin={isAdmin}
      isSubscribed={subscribedStationIds.has(card.id)}
      onNeedEmail={onNeedEmail}
      onToggled={onToggled}
      isNative={isNative}
      t={t}
    />
  );

  const cardGrid = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {favoriteCards.map((card) =>
        isManual ? (
          <SortableRiver key={card.id} id={card.id}>
            {renderCard(card)}
          </SortableRiver>
        ) : (
          <RiverCard
            key={card.id}
            card={card}
            isAdmin={isAdmin}
            isSubscribed={subscribedStationIds.has(card.id)}
            onNeedEmail={onNeedEmail}
            onToggled={onToggled}
            isNative={isNative}
            t={t}
          />
        ),
      )}
    </div>
  );

  const listRows = (
    <div className="flex flex-col gap-2">
      {favoriteCards.map((card) =>
        isManual ? (
          <SortableRiver key={card.id} id={card.id}>
            {renderListItem(card)}
          </SortableRiver>
        ) : (
          <RiverListItem
            key={card.id}
            card={card}
            isAdmin={isAdmin}
            isSubscribed={subscribedStationIds.has(card.id)}
            onNeedEmail={onNeedEmail}
            onToggled={onToggled}
            isNative={isNative}
            t={t}
          />
        ),
      )}
    </div>
  );

  const visibleList = viewMode === "card" ? cardGrid : listRows;

  return (
    <div>
      {/* Header controls */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <SortControl value={sort} onChange={handleSortChange} t={t} />
        <div className="flex items-center gap-2">
          <TimeTravelToggle />
          <div className="inline-flex rounded-lg border border-brand/20 p-0.5">
            <button
              onClick={() => toggleView("card")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === "card"
                  ? "bg-brand/10 text-brand"
                  : "text-foreground/50 hover:text-brand"
              }`}
              aria-label={t("views.card")}
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
            <button
              onClick={() => toggleView("list")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-brand/10 text-brand"
                  : "text-foreground/50 hover:text-brand"
              }`}
              aria-label={t("views.list")}
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {isManual ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={favoriteCards.map((c) => c.id)}
            strategy={rectSortingStrategy}
          >
            {visibleList}
          </SortableContext>
        </DndContext>
      ) : (
        visibleList
      )}
    </div>
  );
}
