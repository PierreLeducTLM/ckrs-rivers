"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslation } from "@/lib/i18n/provider";

// ---------------------------------------------------------------------------
// Pencil icon
// ---------------------------------------------------------------------------

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Editable text field (inline)
// ---------------------------------------------------------------------------

function EditableText({
  value,
  onSave,
  label,
  large,
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
  label: string;
  large?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = async () => {
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (!editing) {
    return (
      <span className="group inline-flex items-center gap-1.5">
        <span className={large ? "text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50" : ""}>
          {value}
        </span>
        <button
          onClick={() => setEditing(true)}
          className="rounded p-0.5 text-zinc-400 opacity-0 transition-opacity hover:text-zinc-600 group-hover:opacity-100 dark:text-zinc-500 dark:hover:text-zinc-300"
          aria-label={`Edit ${label}`}
        >
          <PencilIcon className="h-4 w-4" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") cancel();
        }}
        onBlur={save}
        disabled={saving}
        className={`rounded border border-zinc-300 bg-white px-2 py-0.5 text-zinc-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 ${
          large ? "text-2xl font-bold" : "text-sm"
        }`}
      />
      <button
        onClick={save}
        disabled={saving}
        className="rounded p-0.5 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
        aria-label="Save"
      >
        <CheckIcon className="h-4 w-4" />
      </button>
      <button
        onClick={cancel}
        disabled={saving}
        className="rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
        aria-label="Cancel"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Editable number field (inline)
// ---------------------------------------------------------------------------

function EditableNumber({
  value,
  onSave,
  label,
  placeholder,
  unit,
}: {
  value: number | null;
  onSave: (v: number | null) => Promise<void>;
  label: string;
  placeholder: string;
  unit: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = async () => {
    const parsed = draft.trim() === "" ? null : parseFloat(draft);
    if (parsed !== null && isNaN(parsed)) return;

    const current = value;
    if (parsed === current) {
      setEditing(false);
      return;
    }
    setSaving(true);
    await onSave(parsed);
    setSaving(false);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value?.toString() ?? "");
    setEditing(false);
  };

  if (!editing) {
    return (
      <span className="group inline-flex items-center gap-1">
        {value != null ? (
          <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
            {value}
          </span>
        ) : (
          <span className="text-zinc-400 dark:text-zinc-600">&mdash;</span>
        )}
        {value != null && (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">{unit}</span>
        )}
        <button
          onClick={() => {
            setDraft(value?.toString() ?? "");
            setEditing(true);
          }}
          className="rounded p-0.5 text-zinc-400 opacity-0 transition-opacity hover:text-zinc-600 group-hover:opacity-100 dark:text-zinc-500 dark:hover:text-zinc-300"
          aria-label={`Edit ${label}`}
        >
          <PencilIcon className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        ref={inputRef}
        type="number"
        step="any"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") cancel();
        }}
        onBlur={save}
        disabled={saving}
        placeholder={placeholder}
        className="w-20 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-sm tabular-nums text-zinc-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
      />
      <span className="text-xs text-zinc-400 dark:text-zinc-500">{unit}</span>
      <button
        onClick={save}
        disabled={saving}
        className="rounded p-0.5 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
        aria-label="Save"
      >
        <CheckIcon className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={cancel}
        disabled={saving}
        className="rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
        aria-label="Cancel"
      >
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const RAPID_CLASSES = ["I", "I-II", "II", "II-III", "III", "III-IV", "IV", "IV-V", "V", "V+"];

interface StationMetaEditorProps {
  stationId: string;
  initialName: string;
  initialPaddling: {
    min: number | null;
    ideal: number | null;
    max: number | null;
  };
  initialWeatherCity?: string | null;
  initialRapidClass?: string | null;
  initialDescription?: string | null;
  initialApproved?: boolean;
  initialHidden?: boolean;
  initialPredictorKey?: string | null;
  predictorOptions?: ReadonlyArray<{ key: string; label: string; description: string }>;
  isAdmin?: boolean;
  approved?: boolean;
  unlocked?: boolean;
  onApprovedChange?: (approved: boolean) => void;
  onHiddenChange?: (hidden: boolean) => void;
  onUnlock?: () => void;
}

export default function StationMetaEditor({
  stationId,
  initialName,
  initialPaddling,
  initialWeatherCity = null,
  initialRapidClass = null,
  initialDescription = null,
  initialApproved = false,
  initialHidden = false,
  initialPredictorKey = null,
  predictorOptions = [],
  isAdmin = false,
  approved: approvedProp,
  unlocked: unlockedProp,
  onApprovedChange,
  onHiddenChange,
  onUnlock,
}: StationMetaEditorProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [paddling, setPaddling] = useState(initialPaddling);
  const [weatherCity, setWeatherCity] = useState(initialWeatherCity ?? "");
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [rapidClass, setRapidClass] = useState(initialRapidClass ?? "");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [editingDesc, setEditingDesc] = useState(false);
  const [savingDesc, setSavingDesc] = useState(false);
  const [savingClass, setSavingClass] = useState(false);
  const [predictorKey, setPredictorKey] = useState(initialPredictorKey ?? "");
  const [savingPredictor, setSavingPredictor] = useState(false);

  // Approve/hide state — controlled if parent passes them, otherwise local.
  const [approvedLocal, setApprovedLocal] = useState(initialApproved);
  const [hiddenLocal, setHiddenLocal] = useState(initialHidden);
  const [unlockedLocal, setUnlockedLocal] = useState(false);
  const [savingApproved, setSavingApproved] = useState(false);
  const [savingHidden, setSavingHidden] = useState(false);

  const approved = approvedProp ?? approvedLocal;
  const unlocked = unlockedProp ?? unlockedLocal;
  const locked = approved && !unlocked;

  const patch = async (fields: Record<string, string | number | boolean | null>) => {
    const body = locked && fields.unlock === undefined
      ? { ...fields, unlock: true }
      : fields;
    const res = await fetch(`/api/stations/${stationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res;
  };

  const toggleApproved = async () => {
    setSavingApproved(true);
    const next = !approved;
    const res = await patch({ approved: next });
    setSavingApproved(false);
    if (res.ok) {
      setApprovedLocal(next);
      onApprovedChange?.(next);
      // When unapproving, drop the session-unlock so the lock UI reappears
      // if the admin re-approves.
      if (!next) setUnlockedLocal(false);
    }
  };

  const toggleHidden = async () => {
    setSavingHidden(true);
    const next = !hiddenLocal;
    const res = await patch({ hidden: next });
    setSavingHidden(false);
    if (res.ok) {
      setHiddenLocal(next);
      onHiddenChange?.(next);
    }
  };

  const handleUnlock = () => {
    setUnlockedLocal(true);
    onUnlock?.();
  };

  // Read-only mode for non-admin users
  if (!isAdmin) {
    return (
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {name}
          </h1>
          {rapidClass && (
            <span className="rounded bg-zinc-800 px-2 py-1 text-xs font-bold uppercase text-white dark:bg-zinc-200 dark:text-zinc-900">
              {rapidClass}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Locked admin view: name + rapid class read-only, with an unlock banner.
  // The Approved/Hidden toggles remain available so the admin can manage state.
  if (locked) {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {name}
          </h1>
          {rapidClass && (
            <span className="rounded bg-zinc-800 px-2 py-1 text-xs font-bold uppercase text-white dark:bg-zinc-200 dark:text-zinc-900">
              {rapidClass}
            </span>
          )}
          {hiddenLocal && (
            <span className="inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
              {t("admin.hiddenBadge")}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
          <svg className="h-4 w-4 flex-shrink-0 text-emerald-700 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-3 0h15a1.5 1.5 0 011.5 1.5v7.5a1.5 1.5 0 01-1.5 1.5h-15a1.5 1.5 0 01-1.5-1.5v-7.5a1.5 1.5 0 011.5-1.5z" />
          </svg>
          <span className="text-emerald-900 dark:text-emerald-200">
            {t("admin.lockedBanner")}
          </span>
          <button
            type="button"
            onClick={handleUnlock}
            className="ml-auto rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 dark:hover:bg-emerald-900"
          >
            {t("admin.unlockToEdit")}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={toggleApproved}
            disabled={savingApproved}
            className="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
          >
            {savingApproved ? "..." : t("admin.markUnapproved")}
          </button>
          <button
            type="button"
            onClick={toggleHidden}
            disabled={savingHidden}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {savingHidden ? "..." : hiddenLocal ? t("admin.showToPublic") : t("admin.hideFromPublic")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Approve / Hide controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggleApproved}
          disabled={savingApproved}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
            approved
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }`}
        >
          {approved && (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          )}
          {savingApproved
            ? "..."
            : approved
              ? t("admin.markUnapproved")
              : t("admin.markApproved")}
        </button>
        <button
          type="button"
          onClick={toggleHidden}
          disabled={savingHidden}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
            hiddenLocal
              ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }`}
        >
          {savingHidden ? "..." : hiddenLocal ? t("admin.showToPublic") : t("admin.hideFromPublic")}
        </button>
        {approved && unlocked && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            {t("admin.unlockedNote")}
          </span>
        )}
      </div>

      {/* Editable station name */}
      <EditableText
        value={name}
        label="station name"
        large
        onSave={async (v) => {
          await patch({ name: v });
          setName(v);
        }}
      />

      {/* Paddling levels */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Paddling Levels
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-500 dark:text-zinc-400">{t("editor.min")}</span>
          <EditableNumber
            value={paddling.min}
            label="minimum paddling level"
            placeholder="min"
            unit="m³/s"
            onSave={async (v) => {
              await patch({ paddling_min: v });
              setPaddling((p) => ({ ...p, min: v }));
            }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-500 dark:text-zinc-400">{t("editor.ideal")}</span>
          <EditableNumber
            value={paddling.ideal}
            label="ideal paddling level"
            placeholder="ideal"
            unit="m³/s"
            onSave={async (v) => {
              await patch({ paddling_ideal: v });
              setPaddling((p) => ({ ...p, ideal: v }));
            }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-500 dark:text-zinc-400">{t("editor.max")}</span>
          <EditableNumber
            value={paddling.max}
            label="maximum paddling level"
            placeholder="max"
            unit="m³/s"
            onSave={async (v) => {
              await patch({ paddling_max: v });
              setPaddling((p) => ({ ...p, max: v }));
            }}
          />
        </div>
      </div>

      {/* Weather location override */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {t("editor.weatherLocation")}
        </span>
        <EditableText
          value={weatherCity || ""}
          label="weather city"
          onSave={async (v) => {
            setWeatherError(null);
            const cityValue = v.trim() === "" ? null : v.trim();
            const res = await patch({ weather_city: cityValue });
            if (!res.ok) {
              const data = await res.json();
              setWeatherError(data.error ?? "Failed to save");
              return;
            }
            setWeatherCity(v.trim());
          }}
        />
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {weatherCity ? "" : t("editor.usingStationCoords")}
        </span>
        {weatherError && (
          <span className="text-xs text-red-500">{weatherError}</span>
        )}
      </div>

      {/* Rapid class */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {t("detail.rapidClass")}
        </span>
        <select
          value={rapidClass}
          onChange={async (e) => {
            const value = e.target.value;
            setRapidClass(value);
            setSavingClass(true);
            await patch({ rapid_class: value || null });
            setSavingClass(false);
          }}
          disabled={savingClass}
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        >
          <option value="">—</option>
          {RAPID_CLASSES.map((cls) => (
            <option key={cls} value={cls}>
              {cls}
            </option>
          ))}
        </select>
        {savingClass && (
          <span className="text-xs text-zinc-400">...</span>
        )}
      </div>

      {/* Predictor assignment */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Predictor
        </span>
        <select
          value={predictorKey}
          onChange={async (e) => {
            const value = e.target.value;
            setPredictorKey(value);
            setSavingPredictor(true);
            await patch({ predictor_key: value || null });
            setSavingPredictor(false);
          }}
          disabled={savingPredictor}
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        >
          <option value="">— None —</option>
          {predictorOptions.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        {savingPredictor && <span className="text-xs text-zinc-400">...</span>}
        {predictorKey && (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {predictorOptions.find((p) => p.key === predictorKey)?.description}
          </span>
        )}
      </div>

      {/* Description */}
      <div className="mt-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {t("detail.description")}
          </span>
          {!editingDesc && (
            <button
              onClick={() => setEditingDesc(true)}
              className="rounded p-0.5 text-zinc-400 transition-opacity hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              aria-label="Edit description"
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {editingDesc ? (
          <div className="mt-2">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("detail.descriptionPlaceholder")}
              rows={4}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={async () => {
                  setSavingDesc(true);
                  await patch({ description: description.trim() || null });
                  setSavingDesc(false);
                  setEditingDesc(false);
                }}
                disabled={savingDesc}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {savingDesc ? "..." : "Save"}
              </button>
              <button
                onClick={() => {
                  setDescription(initialDescription ?? "");
                  setEditingDesc(false);
                }}
                disabled={savingDesc}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {t("subscribe.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {description || t("detail.noInstructions")}
          </p>
        )}
      </div>
    </div>
  );
}
