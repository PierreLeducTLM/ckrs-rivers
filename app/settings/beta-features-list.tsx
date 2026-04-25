"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";
import { useFeaturePreviewToggle } from "@/app/use-feature-flag";

interface PreviewFlag {
  key: string;
  state: string;
  label: string;
  description: string | null;
}

/**
 * Page-scale list of "preview" feature flags. Toggling a row only flips a
 * per-device localStorage key — the server flag itself stays in "preview"
 * until an admin promotes it.
 */
export default function BetaFeaturesList() {
  const { t } = useTranslation();
  const [flags, setFlags] = useState<PreviewFlag[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/feature-flags", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { flags: [] }))
      .then((data: { flags: PreviewFlag[] }) => {
        if (cancelled) return;
        setFlags((data.flags ?? []).filter((f) => f.state === "preview"));
      })
      .catch(() => {
        if (!cancelled) setFlags([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (flags === null) {
    return (
      <div className="space-y-2">
        <div className="h-16 animate-pulse rounded-xl bg-foreground/5" />
        <div className="h-16 animate-pulse rounded-xl bg-foreground/5" />
      </div>
    );
  }

  if (flags.length === 0) {
    return (
      <p className="rounded-xl border border-foreground/10 bg-background p-5 text-sm text-foreground/60">
        {t("beta.empty")}
      </p>
    );
  }

  return (
    <ul className="overflow-hidden rounded-xl border border-foreground/10 bg-background">
      {flags.map((f, i) => (
        <li
          key={f.key}
          className={i > 0 ? "border-t border-foreground/10" : undefined}
        >
          <BetaToggleRow
            flagKey={f.key}
            label={f.label}
            description={f.description}
          />
        </li>
      ))}
    </ul>
  );
}

function BetaToggleRow({
  flagKey,
  label,
  description,
}: {
  flagKey: string;
  label: string;
  description: string | null;
}) {
  const { unlocked, toggle } = useFeaturePreviewToggle(flagKey);
  return (
    <button
      onClick={toggle}
      className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-foreground/5"
      aria-pressed={unlocked}
    >
      <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11 3a1 1 0 00-.894.553L7.382 9H4a1 1 0 00-.894 1.447l4 8a1 1 0 001.788 0L12 13.236l3.106 5.21a1 1 0 001.788 0l4-8A1 1 0 0020 9h-3.382l-2.724-5.447A1 1 0 0013 3h-2z" />
      </svg>
      <span className="flex-1">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-snug text-foreground/60">
            {description}
          </span>
        )}
      </span>
      <span
        className={`mt-1 inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${
          unlocked ? "bg-green-500" : "bg-foreground/20"
        }`}
      >
        <span
          className={`mt-0.5 block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            unlocked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}
