"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "@/lib/i18n/provider";

const STORAGE_KEY = "waterflow-favorites";

function getFavorites(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveFavorites(favs: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...favs]));
}

/** Exported so the parent can read favorites for sorting */
export function readFavorites(): Set<string> {
  return getFavorites();
}

export default function FavoriteButton({ stationId }: { stationId: string }) {
  const { t } = useTranslation();
  const [isFav, setIsFav] = useState(false);
  // Avoid hydration mismatch — read localStorage only after mount
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIsFav(getFavorites().has(stationId));
    setMounted(true);
  }, [stationId]);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const favs = getFavorites();
    if (favs.has(stationId)) {
      favs.delete(stationId);
      setIsFav(false);
    } else {
      favs.add(stationId);
      setIsFav(true);
    }
    saveFavorites(favs);
    // Dispatch a storage event so sibling components can react
    window.dispatchEvent(new Event("favorites-changed"));
  };

  if (!mounted) {
    // Render empty placeholder to avoid layout shift
    return <span className="inline-block h-5 w-5" />;
  }

  return (
    <button
      onClick={toggle}
      className="rounded p-0.5 transition-colors hover:scale-110"
      aria-label={isFav ? t("favorites.remove") : t("favorites.add")}
    >
      <svg
        className={`h-5 w-5 ${isFav ? "text-amber-400" : "text-foreground/30 hover:text-foreground/50"}`}
        viewBox="0 0 24 24"
        fill={isFav ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
        />
      </svg>
    </button>
  );
}
