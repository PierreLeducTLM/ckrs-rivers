"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import ThemeToggle from "../theme-toggle";
import LanguageToggle from "../language-toggle";
import { getSubToken } from "../subscribe-button";
import { useTranslation } from "@/lib/i18n/provider";

function NotificationsLink() {
  const { t } = useTranslation();
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    const token = getSubToken();
    if (token) setHref(`/notifications?token=${token}`);
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
        </div>
      )}
    </div>
  );
}
