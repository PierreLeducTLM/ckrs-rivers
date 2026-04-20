"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "@/lib/i18n/provider";
import RiverCard from "./river-card";
import RiverListItem from "./river-list-item";
import SearchBar from "./search-bar";
import SortControl, { type SortMode } from "./sort-control";
import TimeTravelToggle from "./time-travel-toggle";
import { useTab } from "./tab-context";
import type { StationCard } from "./types";
import { idealSortKey, normalizeSearch, statusPriority } from "./utils";

const FAVORITES_KEY = "waterflow-favorites";
const VIEW_MODE_KEY = "waterflow-view-mode";
const SORT_MODE_KEY = "waterflow-sort-mode";

type ViewMode = "card" | "list";

function getFavorites(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
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
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [sort, setSort] = useState<SortMode>("ideal");
  const [search, setSearch] = useState("");
  const [mounted, setMounted] = useState(false);

  const handleSearch = useCallback((q: string) => setSearch(q), []);

  const refreshFavorites = useCallback(() => {
    setFavorites(getFavorites());
  }, []);

  useEffect(() => {
    refreshFavorites();
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    if (saved === "card" || saved === "list") setViewMode(saved);
    const savedSort = localStorage.getItem(SORT_MODE_KEY);
    if (savedSort === "ideal" || savedSort === "status" || savedSort === "name")
      setSort(savedSort);
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

  const favoriteCards = useMemo(() => {
    const filtered = cards.filter((c) => favorites.has(c.id));
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "ideal") {
        const ka = idealSortKey(a);
        const kb = idealSortKey(b);
        if (ka.group !== kb.group) return ka.group - kb.group;
        if (ka.score !== kb.score) return ka.score - kb.score;
        return a.name.localeCompare(b.name);
      }
      // By status (paddleable first)
      const diff = statusPriority(a.status) - statusPriority(b.status);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  }, [cards, favorites, sort]);

  const visibleCards = useMemo(() => {
    const normalizedQuery = normalizeSearch(search);
    if (!normalizedQuery) return favoriteCards;
    return favoriteCards.filter((card) => {
      const nameMatch = normalizeSearch(card.name).includes(normalizedQuery);
      const regionMatch = card.municipality
        ? normalizeSearch(card.municipality).includes(normalizedQuery)
        : false;
      return nameMatch || regionMatch;
    });
  }, [favoriteCards, search]);

  if (!mounted) return null;

  // Empty state — no favorites at all
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

  return (
    <div>
      {/* Search bar */}
      <div className="mb-3">
        <SearchBar
          value={search}
          onChange={handleSearch}
          placeholder={t("myRivers.searchPlaceholder")}
        />
      </div>

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

      {/* Card view */}
      {viewMode === "card" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleCards.map((card) => (
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
          ))}
        </div>
      )}

      {/* List view */}
      {viewMode === "list" && (
        <div className="flex flex-col gap-2">
          {visibleCards.map((card) => (
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
          ))}
        </div>
      )}

      {/* No search results */}
      {visibleCards.length === 0 && (
        <p className="py-12 text-center text-sm text-foreground/40">
          {t("myRivers.noResults")}
        </p>
      )}
    </div>
  );
}
