"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";

export default function RefreshButton({ stationId }: { stationId: string }) {
  const router = useRouter();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/rivers/${stationId}/refresh`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Refresh failed:", data.error ?? res.status);
      }
    } catch (err) {
      console.error("Refresh failed:", err);
    }
    router.refresh();
    setRefreshing(false);
  };

  return (
    <button
      onClick={handleRefresh}
      disabled={refreshing}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      <svg
        className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
        />
      </svg>
      {refreshing ? t("detail.refreshing") : t("detail.refresh")}
    </button>
  );
}
