"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

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
 * and auto-refreshes the page data every 5 minutes.
 */
export default function UpdatedAt({ isoDate }: { isoDate: string }) {
  const [text, setText] = useState(() => timeAgo(isoDate));
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Tick the relative timestamp every 60s
  useEffect(() => {
    setText(timeAgo(isoDate));

    const id = setInterval(() => {
      setText(timeAgo(isoDate));
    }, 60_000);

    return () => clearInterval(id);
  }, [isoDate]);

  // Auto-refresh page data every 5 minutes
  useEffect(() => {
    const id = setInterval(() => {
      startTransition(() => {
        router.refresh();
      });
    }, 5 * 60 * 1000);

    return () => clearInterval(id);
  }, [router, startTransition]);

  return (
    <span className="text-xs text-zinc-400 dark:text-zinc-500">
      Updated {text}
    </span>
  );
}
