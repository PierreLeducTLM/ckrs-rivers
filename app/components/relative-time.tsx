"use client";

import { useState, useEffect } from "react";
import { timeAgo } from "./utils";

interface RelativeTimeProps {
  isoDate: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  className?: string;
}

/**
 * Displays a relative timestamp ("5m ago") that auto-updates every 60 seconds
 * so it stays accurate while the page is open.
 */
export default function RelativeTime({ isoDate, t, className }: RelativeTimeProps) {
  const [text, setText] = useState(() => timeAgo(isoDate, t));

  useEffect(() => {
    // Recalculate immediately when props change
    setText(timeAgo(isoDate, t));

    const id = setInterval(() => {
      setText(timeAgo(isoDate, t));
    }, 60_000);

    return () => clearInterval(id);
  }, [isoDate, t]);

  return <span className={className}>{text}</span>;
}
