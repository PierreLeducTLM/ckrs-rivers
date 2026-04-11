"use client";

import { useState, useEffect, useSyncExternalStore, useCallback } from "react";

const ADMIN_KEY = "waterflow-admin";

// Tiny pub/sub so all useAdmin hooks stay in sync when toggled
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ADMIN_KEY) === "1";
}
function notify() {
  listeners.forEach((cb) => cb());
}

export function useAdmin(): boolean {
  const isAdmin = useSyncExternalStore(subscribe, getSnapshot, () => false);

  useEffect(() => {
    // Check URL param first — ?admin enables, ?admin=off disables
    const params = new URLSearchParams(window.location.search);
    if (params.has("admin")) {
      const val = params.get("admin");
      if (val === "off" || val === "0" || val === "false") {
        localStorage.removeItem(ADMIN_KEY);
      } else {
        localStorage.setItem(ADMIN_KEY, "1");
      }
      notify();
      // Clean the URL without reload
      const url = new URL(window.location.href);
      url.searchParams.delete("admin");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, []);

  return isAdmin;
}

export function useAdminToggle() {
  const isAdmin = useAdmin();

  const toggle = useCallback(() => {
    if (localStorage.getItem(ADMIN_KEY) === "1") {
      localStorage.removeItem(ADMIN_KEY);
    } else {
      localStorage.setItem(ADMIN_KEY, "1");
    }
    notify();
  }, []);

  return { isAdmin, toggle };
}
