"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { setSubToken } from "@/app/subscribe-button";
import { useTranslation } from "@/lib/i18n/provider";

/**
 * /notifications/confirmed?token=xxx
 *
 * Landing page after email confirmation.
 * Stores the token in localStorage so the bell icon can open river selection.
 */
export default function ConfirmedPage() {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (t) {
      setSubToken(t);
    }
    setReady(true);
  }, []);

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <svg
            className="h-8 w-8 text-green-600 dark:text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold">{t("confirmed.title")}</h1>
        <p className="mt-3 text-foreground/60">
          {t("confirmed.message")}
        </p>

        <div className="mt-8">
          <Link
            href="/"
            className="inline-block rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700"
          >
            {t("confirmed.chooseRivers")}
          </Link>
        </div>
      </div>
    </div>
  );
}
