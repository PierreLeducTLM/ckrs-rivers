"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAdmin } from "@/app/use-admin";
import { useFeatureFlag, type FlagState } from "@/app/use-feature-flag";
import { useTranslation } from "@/lib/i18n/provider";
import StationMetaEditor from "./station-meta-editor";
import type { Rapid } from "@/lib/domain/river-station";

const RiverPathEditor = dynamic(() => import("./river-path-editor"), {
  ssr: false,
  loading: () => (
    <div className="mt-4 h-12 animate-pulse rounded-lg bg-foreground/5" />
  ),
});

const RapidsEditor = dynamic(() => import("./rapids-editor"), {
  ssr: false,
  loading: () => (
    <div className="mt-2 h-10 animate-pulse rounded-lg bg-foreground/5" />
  ),
});

interface RiverHeaderProps {
  stationId: string;
  initialName: string;
  initialPaddling: {
    min: number | null;
    ideal: number | null;
    max: number | null;
  };
  initialWeatherCity: string | null;
  stationLat: number;
  stationLon: number;
  catchmentArea?: number;
  initialPutIn?: [number, number] | null;
  initialTakeOut?: [number, number] | null;
  initialRiverPath?: [number, number][] | null;
  initialRapidClass?: string | null;
  initialDescription?: string | null;
  initialRapids?: Rapid[];
  initialApproved?: boolean;
  initialHidden?: boolean;
  rapidsFlagState?: FlagState;
  regime?: string | null;
}

export default function RiverHeader({
  stationId,
  initialName,
  initialPaddling,
  initialWeatherCity,
  stationLat,
  stationLon,
  catchmentArea,
  initialPutIn = null,
  initialTakeOut = null,
  initialRiverPath = null,
  initialRapidClass = null,
  initialDescription = null,
  initialRapids = [],
  initialApproved = false,
  initialHidden = false,
  rapidsFlagState = "off",
  regime = null,
}: RiverHeaderProps) {
  const isAdmin = useAdmin();
  const { t } = useTranslation();
  const router = useRouter();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Lifted approve/unlock state — shared with path & rapids editors so they
  // can also enter read-only mode when the river is approved.
  const [approved, setApproved] = useState(initialApproved);
  const [hidden, setHidden] = useState(initialHidden);
  const [unlocked, setUnlocked] = useState(false);
  const editingDisabled = approved && !unlocked;

  // Admins always see rapids editing tools regardless of the flag (so they
  // can prepare content while the feature is still hidden from end users).
  const rapidsVisible = useFeatureFlag("rapids", rapidsFlagState) || isAdmin;

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/stations/${stationId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/");
      } else {
        const body = await res.json().catch(() => ({}));
        setDeleteError(body.error ?? "Failed to delete river");
      }
    } catch {
      setDeleteError("Network error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {hidden && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" />
          </svg>
          {t("admin.hiddenBanner")}
        </div>
      )}
      <StationMetaEditor
        stationId={stationId}
        initialName={initialName}
        initialPaddling={initialPaddling}
        initialWeatherCity={initialWeatherCity}
        initialRapidClass={initialRapidClass}
        initialDescription={initialDescription}
        initialApproved={approved}
        initialHidden={hidden}
        isAdmin={isAdmin}
        approved={approved}
        unlocked={unlocked}
        onApprovedChange={setApproved}
        onHiddenChange={setHidden}
        onUnlock={() => setUnlocked(true)}
      />
      {isAdmin && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
          <span>
            {t("detail.station")}{" "}
            <span className="font-mono text-zinc-700 dark:text-zinc-300">{stationId}</span>
          </span>
          <span className="hidden sm:inline" aria-hidden="true">&middot;</span>
          <span>
            {stationLat.toFixed(4)}N, {stationLon.toFixed(4)}W
          </span>
          {catchmentArea !== undefined && (
            <>
              <span className="hidden sm:inline" aria-hidden="true">&middot;</span>
              <span>
                {t("detail.catchment")}{" "}
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {Number(catchmentArea).toLocaleString()} km&sup2;
                </span>
              </span>
            </>
          )}
          {regime === "Influencé" && (
            <>
              <span className="hidden sm:inline" aria-hidden="true">&middot;</span>
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                {t("detail.damControlled")}
              </span>
            </>
          )}
        </div>
      )}
      {isAdmin && !editingDisabled && (
        <RiverPathEditor
          stationId={stationId}
          stationLat={stationLat}
          stationLon={stationLon}
          initialPutIn={initialPutIn}
          initialTakeOut={initialTakeOut}
          initialPath={initialRiverPath}
        />
      )}
      {isAdmin && !editingDisabled && rapidsFlagState !== "off" && (
        <RapidsEditor
          stationId={stationId}
          stationLat={stationLat}
          stationLon={stationLon}
          riverPath={initialRiverPath}
          initialRapids={initialRapids}
        />
      )}
      {!isAdmin && rapidsVisible && initialRapids.length > 0 && (
        <div className="mt-4">
          <Link
            href={`/rivers/${stationId}/rapids`}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M3 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0" strokeLinecap="round" />
            </svg>
            {t("detail.viewRapids", { n: initialRapids.length })}
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      )}
      {isAdmin && !approved && (
        <>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="mt-4 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
          >
            {t("admin.deleteRiver")}
          </button>

          {showDeleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  {t("admin.deleteConfirmTitle")}
                </h3>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  {t("admin.deleteConfirmMessage", { name: initialName })}
                </p>
                {deleteError && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {deleteError}
                  </p>
                )}
                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteError(null);
                    }}
                    disabled={deleting}
                    className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {t("subscribe.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleting ? t("admin.deleting") : t("admin.confirmDelete")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
