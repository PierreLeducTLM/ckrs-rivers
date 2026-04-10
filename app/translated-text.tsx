"use client";

import { useTranslation } from "@/lib/i18n/provider";

/** Tiny client component to render a translated string inside server components */
export default function T({ k, params }: { k: string; params?: Record<string, string | number> }) {
  const { t } = useTranslation();
  return <>{t(k, params)}</>;
}
