"use client";

import { useTranslation } from "@/lib/i18n/provider";

const STATUS_STYLES: Record<string, string> = {
  "detail.ideal": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  "detail.goodToGo": "bg-green-500/10 text-green-700 dark:text-green-400",
  "detail.tooLow": "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  "detail.tooHigh": "bg-red-500/10 text-red-700 dark:text-red-400",
  "detail.runnableInHours": "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  "detail.runnableInDays": "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  "detail.droppingOutHours": "bg-orange-500/10 text-orange-700 dark:text-orange-400",
};

export default function PaddlingStatusMessage({
  statusKey,
  param,
}: {
  statusKey: string;
  param?: number;
}) {
  const { t } = useTranslation();
  const style = STATUS_STYLES[statusKey] ?? "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400";
  const text = param != null ? t(statusKey, { n: param }) : t(statusKey);

  return (
    <span className={`inline-block rounded-full px-3 py-0.5 text-sm font-medium ${style}`}>
      {text}
    </span>
  );
}
