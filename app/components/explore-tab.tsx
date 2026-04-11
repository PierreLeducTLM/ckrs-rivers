"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "@/lib/i18n/provider";
import SearchBar from "./search-bar";
import FilterChips, { type StatusFilter } from "./filter-chips";
import RiverListItem from "./river-list-item";
import type { StationCard } from "./types";
import { statusPriority, normalizeSearch } from "./utils";

interface ExploreTabProps {
  cards: StationCard[];
  isAdmin: boolean;
  subscribedStationIds: Set<string>;
  onNeedEmail: () => void;
  onToggled: () => void;
  isNative: boolean;
}

export default function ExploreTab({
  cards,
  isAdmin,
  subscribedStationIds,
  onNeedEmail,
  onToggled,
  isNative,
}: ExploreTabProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [, setFavVersion] = useState(0);

  // Re-render when favorites change so star icons update
  useEffect(() => {
    const handler = () => setFavVersion((v) => v + 1);
    window.addEventListener("favorites-changed", handler);
    return () => window.removeEventListener("favorites-changed", handler);
  }, []);

  // Collect unique municipalities for region dropdown
  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const card of cards) {
      if (card.municipality) set.add(card.municipality);
    }
    return [...set].sort();
  }, [cards]);

  const handleSearch = useCallback((q: string) => setSearch(q), []);

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeSearch(search);

    return cards
      .filter((card) => {
        // Search filter
        if (normalizedQuery) {
          const nameMatch = normalizeSearch(card.name).includes(normalizedQuery);
          const regionMatch = card.municipality
            ? normalizeSearch(card.municipality).includes(normalizedQuery)
            : false;
          if (!nameMatch && !regionMatch) return false;
        }

        // Status filter
        if (statusFilter !== "all") {
          if (statusFilter === "ideal" && card.status !== "ideal") return false;
          if (statusFilter === "runnable" && card.status !== "runnable")
            return false;
          if (statusFilter === "too-low" && card.status !== "too-low")
            return false;
        }

        // Region filter
        if (regionFilter !== "all") {
          if (card.municipality !== regionFilter) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const diff = statusPriority(a.status) - statusPriority(b.status);
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name);
      });
  }, [cards, search, statusFilter, regionFilter]);

  return (
    <div>
      {/* Search bar */}
      <div className="sticky top-0 z-10 bg-background pb-3 pt-1">
        <SearchBar
          value={search}
          onChange={handleSearch}
          placeholder={t("explore.searchPlaceholder")}
        />

        {/* Filters row */}
        <div className="mt-3">
          <FilterChips value={statusFilter} onChange={setStatusFilter} t={t} />

          {/* Region dropdown — commented out for now, will reactivate later
          {regions.length > 1 && (
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="flex-shrink-0 rounded-lg border border-foreground/15 bg-foreground/5 px-2.5 py-1.5 text-xs font-medium text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="all">{t("explore.allRegions")}</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
          */}
        </div>
      </div>

      {/* Results count */}
      <p className="mb-3 text-xs text-foreground/40">
        {t("explore.riverCount", { n: filtered.length })}
      </p>

      {/* River list */}
      <div className="flex flex-col gap-2">
        {filtered.map((card) => (
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
        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-foreground/40">
            {t("explore.noResults")}
          </p>
        )}
      </div>
    </div>
  );
}
