"use client";

import { useTranslation, type Locale } from "@/lib/i18n/provider";

export default function LanguageToggle() {
  const { locale, setLocale, t } = useTranslation();

  const next: Locale = locale === "en" ? "fr" : "en";

  return (
    <button
      onClick={() => setLocale(next)}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-foreground/50 transition-colors hover:text-brand"
      aria-label={`Switch to ${next === "en" ? "English" : "Français"}`}
    >
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
      </svg>
      {t("language.label")}
    </button>
  );
}
