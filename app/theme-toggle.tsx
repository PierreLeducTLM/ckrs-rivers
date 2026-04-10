"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "@/lib/i18n/provider";

const STORAGE_KEY = "kras-theme";
type Theme = "system" | "light" | "dark";

function getStored(): Theme {
  if (typeof window === "undefined") return "system";
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark") return v;
  return "system";
}

function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export default function ThemeToggle() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getStored());
    setMounted(true);
  }, []);

  useEffect(() => {
    apply(theme);
    if (theme === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, theme);
    }
  }, [theme]);

  // Listen for OS preference changes when in system mode
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (getStored() === "system") apply("system");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const cycle = useCallback(() => {
    setTheme((t) => (t === "system" ? "light" : t === "light" ? "dark" : "system"));
  }, []);

  if (!mounted) return <div className="h-8 w-8" />;

  const label = theme === "system" ? t("theme.system") : theme === "light" ? t("theme.light") : t("theme.dark");

  return (
    <button
      onClick={cycle}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-foreground/50 transition-colors hover:text-brand"
      aria-label={t("theme.ariaLabel", { theme: label })}
    >
      {theme === "light" && (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      )}
      {theme === "dark" && (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      )}
      {theme === "system" && (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      )}
      {t("theme.label")}
    </button>
  );
}
