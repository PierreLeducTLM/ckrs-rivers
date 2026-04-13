"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "@/lib/i18n/provider";
import { initPushNotifications } from "@/lib/capacitor/push";

const SUB_TOKEN_KEY = "waterflow-sub-token";

/** Check if the user has a stored subscription token */
export function getSubToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SUB_TOKEN_KEY);
}

/** Store the subscription token after confirmation */
export function setSubToken(token: string) {
  localStorage.setItem(SUB_TOKEN_KEY, token);
}

export default function SubscribeButton({
  stationId,
  isSubscribed,
  onNeedEmail,
  onToggled,
  isNative,
}: {
  stationId: string;
  isSubscribed: boolean;
  onNeedEmail: () => void;
  onToggled: () => void;
  isNative?: boolean;
}) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Native: use push notifications directly (no email needed)
      if (isNative) {
        setToggling(true);
        try {
          // Await registration — returns token once APNs/FCM completes
          const pushToken = await initPushNotifications();
          if (!pushToken) {
            console.error("Push registration failed or permission denied");
            setToggling(false);
            return;
          }

          await fetch("/api/notifications/push-register", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: pushToken,
              stationId,
              subscribe: !isSubscribed,
            }),
          });
          onToggled();
        } catch (err) {
          console.error("Subscribe toggle failed:", err);
        }
        setToggling(false);
        return;
      }

      // Web: use email subscription flow
      const token = getSubToken();
      if (!token) {
        onNeedEmail();
        return;
      }

      setToggling(true);
      try {
        if (isSubscribed) {
          await fetch(
            `/api/notifications/unsubscribe?token=${token}&stationId=${stationId}`,
            { method: "DELETE" },
          );
        } else {
          await fetch(`/api/notifications/subscribe-station?token=${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stationId }),
          });
        }
        onToggled();
      } catch {
        // Silently fail
      }
      setToggling(false);
    },
    [stationId, isSubscribed, isNative, onNeedEmail, onToggled],
  );

  if (!mounted) {
    return <span className="inline-block h-5 w-5" />;
  }

  return (
    <button
      onClick={handleClick}
      disabled={toggling}
      className={`rounded p-0.5 transition-colors hover:scale-110 ${toggling ? "opacity-50" : ""}`}
      aria-label={isSubscribed ? t("subscribe.unsubscribe") : t("subscribe.subscribe")}
    >
      <svg
        className={`h-5 w-5 ${
          isSubscribed
            ? "text-blue-400"
            : "text-foreground/30 hover:text-foreground/50"
        }`}
        viewBox="0 0 24 24"
        fill={isSubscribed ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
        />
      </svg>
    </button>
  );
}
