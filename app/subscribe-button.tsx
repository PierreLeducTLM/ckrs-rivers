"use client";

import { useState, useEffect } from "react";

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
  stationName,
  onSubscribeClick,
}: {
  stationId: string;
  stationName: string;
  onSubscribeClick: (stationId: string, stationName: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    setHasToken(!!getSubToken());
    setMounted(true);
  }, []);

  if (!mounted) {
    return <span className="inline-block h-5 w-5" />;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSubscribeClick(stationId, stationName);
  };

  return (
    <button
      onClick={handleClick}
      className="rounded p-0.5 transition-colors hover:scale-110"
      aria-label={hasToken ? "Manage notifications" : "Subscribe to notifications"}
    >
      <svg
        className={`h-5 w-5 ${
          hasToken
            ? "text-blue-400"
            : "text-foreground/30 hover:text-foreground/50"
        }`}
        viewBox="0 0 24 24"
        fill={hasToken ? "currentColor" : "none"}
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
