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

interface StationMetaEditorProps {
  stationId: string;
  initialName: string;
  initialPaddling: {
    min: number | null;
    ideal: number | null;
    max: number | null;
  };
  initialWeatherCity?: string | null;
  isAdmin?: boolean;
}

export default function StationMetaEditor({
  stationId,
  initialName,
  initialPaddling,
  initialWeatherCity = null,
  isAdmin = false,
}: StationMetaEditorProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [paddling, setPaddling] = useState(initialPaddling);
  const [weatherCity, setWeatherCity] = useState(initialWeatherCity ?? "");
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const patch = async (fields: Record<string, string | number | null>) => {
    const res = await fetch(`/api/stations/${stationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    return res;
  };

  // Read-only mode for non-admin users
  if (!isAdmin) {
    return (
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {name}
        </h1>
        {(paddling.min != null || paddling.ideal != null || paddling.max != null) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {t("editor.paddlingLevels")}
            </span>
            {paddling.min != null && (
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-500 dark:text-zinc-400">{t("editor.min")}</span>
                <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">{paddling.min}</span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">m³/s</span>
              </div>
            )}
            {paddling.ideal != null && (
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-500 dark:text-zinc-400">{t("editor.ideal")}</span>
                <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">{paddling.ideal}</span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">m³/s</span>
              </div>
            )}
            {paddling.max != null && (
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-500 dark:text-zinc-400">{t("editor.max")}</span>
                <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">{paddling.max}</span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">m³/s</span>
              </div>
            )}
          </div>
        )}
        {weatherCity && (
          <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {t("editor.weather")} {weatherCity}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
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
    </div>
  );
}
