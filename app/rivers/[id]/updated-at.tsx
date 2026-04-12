"use client";

import { useState, useEffect, useRef } from "react";

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Client component that displays "Updated Xm ago", re-calculates every 60s,
 * and polls /api/freshness to reload the page when fresh data arrives.
 */
export default function UpdatedAt({
  isoDate,
  stationId,
}: {
  isoDate: string;
  stationId: string;
}) {
  const [text, setText] = useState(() => timeAgo(isoDate));
  const knownTs = useRef(isoDate);

  // Tick the relative timestamp every 60s
  useEffect(() => {
    setText(timeAgo(isoDate));

    const id = setInterval(() => {
      setText(timeAgo(isoDate));
    }, 60_000);

    return () => clearInterval(id);
  }, [isoDate]);

  // Poll /api/freshness every 2 min, reload when this station has new data
  useEffect(() => {
    let cancelled = false;

    async function checkFreshness() {
      if (document.hidden) return;
      try {
        const res = await fetch(
          `/api/freshness?station=${encodeURIComponent(stationId)}`,
          { cache: "no-store" },
        );
        if (!res.ok || cancelled) return;
        const { ts } = (await res.json()) as { ts: string | null };
        if (ts && ts !== knownTs.current) {
          knownTs.current = ts;
          window.location.reload();
        }
      } catch {
        // network error — ignore, will retry next interval
      }
    }

    const id = setInterval(checkFreshness, 2 * 60 * 1000);

    function onVisibilityChange() {
      if (!document.hidden) checkFreshness();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [stationId]);

  return (
    <span className="text-xs text-zinc-400 dark:text-zinc-500">
      Updated {text}
    </span>
  );
}
