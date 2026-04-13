"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Locale = "en" | "fr";

type Messages = typeof en;

const MESSAGES: Record<Locale, Messages> = { en, fr };
const STORAGE_KEY = "flowcast-locale";
const SUPPORTED: Locale[] = ["en", "fr"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a dotted key like "app.title" from a nested object */
function resolve(obj: Record<string, unknown>, path: string): string {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return path;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : path;
}

/** Detect device/browser language, return best match */
function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "fr";
  const lang = navigator.language?.toLowerCase() ?? "";
  if (lang.startsWith("fr")) return "fr";
  if (lang.startsWith("en")) return "en";
  // Check additional languages from navigator.languages
  for (const l of navigator.languages ?? []) {
    const code = l.toLowerCase();
    if (code.startsWith("fr")) return "fr";
    if (code.startsWith("en")) return "en";
  }
  return "fr"; // Default to French (Quebec app)
}

function getStored(): Locale | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(STORAGE_KEY);
  if (SUPPORTED.includes(v as Locale)) return v as Locale;
  return null;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "fr",
  setLocale: () => {},
  t: (key) => key,
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function I18nProvider({ children }: { children: ReactNode }) {
  // Always start with "fr" to match server-rendered HTML and avoid hydration mismatch.
  // The real locale is resolved in the effect below after hydration.
  const [locale, setLocaleState] = useState<Locale>("fr");

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l;
  }, []);

  // After hydration, switch to the stored/detected locale
  useEffect(() => {
    const resolved = getStored() ?? detectLocale();
    setLocaleState(resolved);
    document.documentElement.lang = resolved;
  }, []);

  // Keep <html lang> in sync on subsequent changes
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let text = resolve(MESSAGES[locale] as unknown as Record<string, unknown>, key);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTranslation() {
  return useContext(I18nContext);
}
