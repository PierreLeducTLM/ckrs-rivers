"use client";

import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n/provider";

export default function BackButton() {
  const router = useRouter();
  const { t } = useTranslation();

  const handleBack = () => {
    // If the user navigated here from within the app, go back to preserve
    // scroll position and state. Otherwise (shared link / direct access),
    // navigate to the dashboard.
    const hasAppHistory =
      typeof document !== "undefined" &&
      document.referrer &&
      document.referrer.startsWith(window.location.origin);

    if (hasAppHistory) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <button
      onClick={handleBack}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
    >
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 19.5L8.25 12l7.5-7.5"
        />
      </svg>
      {t("detail.backToDashboard")}
    </button>
  );
}
