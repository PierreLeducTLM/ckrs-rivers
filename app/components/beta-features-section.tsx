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
 * Lazily fetches the list of preview-state feature flags from the server and
 * renders one toggle per flag. The toggle only flips a per-device localStorage
 * key — the server flag itself stays in "preview" until an admin promotes it.
 *
 * Hidden when there are no preview flags so the menu stays compact.
 */
export default function BetaFeaturesSection() {
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

  if (!flags || flags.length === 0) return null;

  return (
    <>
      <div className="my-0.5 border-t border-foreground/10" />
      <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/40">
        {t("beta.title")}
      </div>
      {flags.map((f) => (
        <BetaToggle key={f.key} flagKey={f.key} label={f.label} description={f.description} />
      ))}
    </>
  );
}

function BetaToggle({
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
      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-foreground/60 transition-colors hover:bg-foreground/5"
      aria-pressed={unlocked}
    >
      <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11 3a1 1 0 00-.894.553L7.382 9H4a1 1 0 00-.894 1.447l4 8a1 1 0 001.788 0L12 13.236l3.106 5.21a1 1 0 001.788 0l4-8A1 1 0 0020 9h-3.382l-2.724-5.447A1 1 0 0013 3h-2z" />
      </svg>
      <span className="flex-1">
        <span className="block text-foreground">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[10px] leading-tight text-foreground/40">
            {description}
          </span>
        )}
      </span>
      <span
        className={`mt-0.5 inline-block h-3 w-6 shrink-0 rounded-full transition-colors ${
          unlocked ? "bg-green-500" : "bg-foreground/20"
        }`}
      >
        <span
          className={`mt-0.5 block h-2 w-2 rounded-full bg-white shadow transition-transform ${
            unlocked ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}
