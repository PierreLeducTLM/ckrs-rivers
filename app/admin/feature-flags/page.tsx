"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface FeatureFlag {
  key: string;
  state: "off" | "preview" | "on";
  label: string;
  description: string | null;
  updatedAt: string;
}

const STATES: Array<FeatureFlag["state"]> = ["off", "preview", "on"];
const STATE_DESCRIPTIONS: Record<FeatureFlag["state"], string> = {
  off: "Hidden from everyone",
  preview: "Hidden by default; users can opt in via Settings → Beta features",
  on: "Visible to everyone",
};

export default function FeatureFlagsAdminPage() {
  const [flags, setFlags] = useState<FeatureFlag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/feature-flags", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { flags: FeatureFlag[] }) => setFlags(d.flags))
      .catch(() => setError("Failed to load feature flags"));
  }, []);

  async function update(key: string, state: FeatureFlag["state"]) {
    setSavingKey(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, state }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to update flag");
        return;
      }
      setFlags((prev) =>
        prev ? prev.map((f) => (f.key === key ? { ...f, state } : f)) : prev,
      );
    } catch {
      setError("Network error");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Feature flags
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Control rollout of in-progress features. Changes take effect within ~30 seconds for end users.
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">
            {error}
          </div>
        )}

        {flags === null && (
          <div className="mt-6 h-24 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        )}

        {flags && flags.length === 0 && (
          <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-500">
            No feature flags configured.
          </p>
        )}

        {flags && flags.length > 0 && (
          <ul className="mt-6 space-y-4">
            {flags.map((f) => (
              <li
                key={f.key}
                className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                      {f.label}
                    </h2>
                    <p className="mt-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-500">
                      {f.key}
                    </p>
                    {f.description && (
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                        {f.description}
                      </p>
                    )}
                  </div>
                  {savingKey === f.key && (
                    <span className="text-xs text-zinc-400">Saving...</span>
                  )}
                </div>
                <div className="mt-4 inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-800 dark:bg-zinc-950">
                  {STATES.map((s) => {
                    const active = f.state === s;
                    return (
                      <button
                        key={s}
                        onClick={() => !active && update(f.key, s)}
                        disabled={savingKey === f.key}
                        className={`px-4 py-1.5 text-sm font-medium capitalize transition-colors disabled:opacity-50 ${
                          active
                            ? s === "on"
                              ? "rounded bg-green-600 text-white"
                              : s === "preview"
                                ? "rounded bg-amber-500 text-white"
                                : "rounded bg-zinc-300 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                            : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                  {STATE_DESCRIPTIONS[f.state]}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
