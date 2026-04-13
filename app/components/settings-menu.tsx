"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import ThemeToggle from "../theme-toggle";
import LanguageToggle from "../language-toggle";
import { getSubToken } from "../subscribe-button";
import { getPushToken } from "@/lib/capacitor/push";
import { useTranslation } from "@/lib/i18n/provider";
import { useAdminToggle } from "../use-admin";

function NotificationsLink() {
  const { t } = useTranslation();
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    // Prefer subscriber token (web email flow)
    const subToken = getSubToken();
    if (subToken) {
      setHref(`/notifications?token=${subToken}`);
      return;
    }
    // Fall back to push token on native
    const pushToken = getPushToken();
    if (pushToken) {
      setHref(`/notifications?pushToken=${pushToken}`);
    }
  }, []);

  if (!href) return null;

  return (
    <Link
      href={href}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-foreground/50 transition-colors hover:text-brand"
    >
      <svg
        className="h-4 w-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
      {t("notifications.title")}
    </Link>
  );
}

export default function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { isAdmin, toggle: toggleAdmin } = useAdminToggle();

  // Show admin toggle once revealed (persisted in sessionStorage so it
  // survives menu close but resets on new tab)
  const [showAdminToggle, setShowAdminToggle] = useState(false);
  useEffect(() => {
    // If already admin, always show the toggle
    if (isAdmin) setShowAdminToggle(true);
    else if (typeof window !== "undefined" && sessionStorage.getItem("waterflow-admin-revealed") === "1") {
      setShowAdminToggle(true);
    }
  }, [isAdmin]);

  // Long-press (3s) on the gear icon to reveal admin toggle
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);
  const startLongPress = useCallback(() => {
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      setShowAdminToggle(true);
      sessionStorage.setItem("waterflow-admin-revealed", "1");
      setOpen(true);
    }, 5000);
  }, [clearLongPress]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onTouchStart={startLongPress}
        onTouchEnd={clearLongPress}
        onTouchCancel={clearLongPress}
        onMouseDown={startLongPress}
        onMouseUp={clearLongPress}
        onMouseLeave={clearLongPress}
        className="rounded-md p-1.5 text-foreground/50 transition-colors hover:text-brand"
        aria-label="Settings"
        aria-expanded={open}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[9999] mt-1 flex min-w-[160px] flex-col gap-0.5 rounded-lg border border-foreground/10 bg-background p-1.5 shadow-lg">
          <NotificationsLink />
          <LanguageToggle />
          <ThemeToggle />
          {showAdminToggle && (
            <>
              <div className="my-0.5 border-t border-foreground/10" />
              <button
                onClick={() => {
                  toggleAdmin();
                  setOpen(false);
                  window.location.reload();
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-foreground/50 transition-colors hover:text-brand"
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{isAdmin ? "Admin: ON" : "Admin: OFF"}</span>
                <span
                  className={`ml-auto inline-block h-3 w-6 rounded-full transition-colors ${
                    isAdmin ? "bg-green-500" : "bg-foreground/20"
                  }`}
                >
                  <span
                    className={`mt-0.5 block h-2 w-2 rounded-full bg-white shadow transition-transform ${
                      isAdmin ? "translate-x-3.5" : "translate-x-0.5"
                    }`}
                  />
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
