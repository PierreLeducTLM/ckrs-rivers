"use client";

import { useTranslation, type Locale } from "@/lib/i18n/provider";

export default function LanguageToggle() {
  const { locale, setLocale } = useTranslation();

  const next: Locale = locale === "en" ? "fr" : "en";

  return (
    <button
      onClick={() => setLocale(next)}
      className="rounded-md px-1.5 py-1 text-xs font-semibold uppercase text-foreground/50 transition-colors hover:text-brand"
      aria-label={`Switch to ${next === "en" ? "English" : "Français"}`}
      title={next === "en" ? "English" : "Français"}
    >
      {locale.toUpperCase()}
    </button>
  );
}
