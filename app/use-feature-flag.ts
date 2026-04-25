"use client";

import { useSyncExternalStore, useCallback } from "react";

/**
 * Per-device unlock store for "preview" feature flags.
 *
 * The server tells the client whether a flag is "off" / "preview" / "on".
 * For "preview", the user opts in on this device via Settings → Beta features
 * (or admins flip a localStorage key directly). The store below tracks those
 * opt-ins and notifies all useFeatureFlag hooks when they change.
 */

export type FlagState = "off" | "preview" | "on";

const STORAGE_PREFIX = "flowcast-preview-";

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function notify() {
  listeners.forEach((cb) => cb());
}

// Cross-tab sync (web). Capacitor's localStorage doesn't fire StorageEvent
// across native windows, but the in-memory pub/sub above covers single-tab
// changes which is the common case on mobile.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key && e.key.startsWith(STORAGE_PREFIX)) notify();
  });
}

function readUnlocked(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

export function setFeaturePreviewUnlocked(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      localStorage.setItem(STORAGE_PREFIX + key, "1");
    } else {
      localStorage.removeItem(STORAGE_PREFIX + key);
    }
  } catch {
    // ignore
  }
  notify();
}

/**
 * Returns whether a feature is currently visible to this device.
 *
 * - serverState "on"      → always true
 * - serverState "off"     → always false
 * - serverState "preview" → true only if the user has opted in on this device
 */
export function useFeatureFlag(key: string, serverState: FlagState): boolean {
  const unlocked = useSyncExternalStore(
    subscribe,
    () => readUnlocked(key),
    () => false,
  );
  if (serverState === "on") return true;
  if (serverState === "off") return false;
  return unlocked;
}

/**
 * Hook for the Settings UI: read + toggle the per-device unlock for a flag.
 * The server state is irrelevant here — the toggle only controls the local
 * opt-in. If the server flag is "off" the user simply won't see the toggle
 * in Settings (we filter to "preview" flags only).
 */
export function useFeaturePreviewToggle(key: string): {
  unlocked: boolean;
  toggle: () => void;
  set: (value: boolean) => void;
} {
  const unlocked = useSyncExternalStore(
    subscribe,
    () => readUnlocked(key),
    () => false,
  );
  const toggle = useCallback(() => {
    setFeaturePreviewUnlocked(key, !readUnlocked(key));
  }, [key]);
  const set = useCallback(
    (value: boolean) => setFeaturePreviewUnlocked(key, value),
    [key],
  );
  return { unlocked, toggle, set };
}
