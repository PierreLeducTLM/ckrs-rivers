"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface StationFlow {
  id: string;
  name: string;
  paddling_min: number | null;
  paddling_ideal: number | null;
  paddling_max: number | null;
}

// ---------------------------------------------------------------------------
// Inline editable number cell
// ---------------------------------------------------------------------------

function EditableCell({
  value,
  onSave,
  label,
}: {
  value: number | null;
  onSave: (v: number | null) => Promise<void>;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const save = async () => {
    const parsed = draft.trim() === "" ? null : parseFloat(draft);
    if (parsed !== null && isNaN(parsed)) {
      cancel();
      return;
    }
    if (parsed === value) {
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
      <button
        onClick={() => {
          setDraft(value?.toString() ?? "");
          setEditing(true);
        }}
        className="w-full rounded px-2 py-1 text-right tabular-nums transition-colors hover:bg-foreground/5"
        aria-label={`Edit ${label}`}
      >
        {value != null ? (
          <span className="font-medium">{value}</span>
        ) : (
          <span className="text-foreground/30">&mdash;</span>
        )}
      </button>
    );
  }

  return (
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
      className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      aria-label={label}
    />
  );
}

// ---------------------------------------------------------------------------
// Sort chevron icon
// ---------------------------------------------------------------------------

function SortIcon({ direction }: { direction: "asc" | "desc" }) {
  return (
    <svg className="ml-1 inline h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
      {direction === "asc" ? (
        <path d="M6 2l4 5H2z" />
      ) : (
        <path d="M6 10l4-5H2z" />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function FlowManagementPage() {
  const [stations, setStations] = useState<StationFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    fetch("/api/admin/flow-levels")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load stations");
        return res.json();
      })
      .then((data) => setStations(data.stations))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const patchStation = async (
    id: string,
    field: "paddling_min" | "paddling_ideal" | "paddling_max",
    value: number | null,
  ) => {
    const res = await fetch(`/api/stations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) return;
    setStations((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)),
    );
  };

  // Filter + sort
  const filtered = stations
    .filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return sortDir === "asc" ? cmp : -cmp;
    });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-4xl px-6 py-8">
        {/* Back link */}
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1 text-sm text-foreground/50 hover:text-foreground/80"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back
        </Link>

        <h1 className="text-2xl font-bold tracking-tight">Flow Management</h1>
        <p className="mt-1 text-sm text-foreground/50">
          Edit paddling flow thresholds (m³/s) for each river. Click any value to edit.
        </p>

        {/* Filter */}
        <div className="mt-4">
          <input
            type="text"
            placeholder="Filter by river name..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-lg border border-foreground/15 bg-foreground/[0.02] px-3 py-2 text-sm outline-none placeholder:text-foreground/30 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {loading && (
          <p className="mt-8 text-center text-foreground/40">Loading...</p>
        )}
        {error && (
          <p className="mt-8 text-center text-red-500">{error}</p>
        )}

        {!loading && !error && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-foreground/10 text-xs font-semibold uppercase tracking-wider text-foreground/50">
                  <th className="pb-2 pr-4">
                    <button
                      onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                      className="inline-flex items-center hover:text-foreground/80"
                    >
                      River Name
                      <SortIcon direction={sortDir} />
                    </button>
                  </th>
                  <th className="w-24 pb-2 text-right">Min</th>
                  <th className="w-24 pb-2 text-right">Ideal</th>
                  <th className="w-24 pb-2 text-right">Max</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {filtered.map((station) => (
                  <tr key={station.id} className="group">
                    <td className="py-2 pr-4 font-medium">
                      <Link
                        href={`/rivers/${station.id}`}
                        className="hover:text-blue-500 hover:underline"
                      >
                        {station.name}
                      </Link>
                    </td>
                    <td className="w-24 py-1">
                      <EditableCell
                        value={station.paddling_min}
                        label={`min flow for ${station.name}`}
                        onSave={(v) => patchStation(station.id, "paddling_min", v)}
                      />
                    </td>
                    <td className="w-24 py-1">
                      <EditableCell
                        value={station.paddling_ideal}
                        label={`ideal flow for ${station.name}`}
                        onSave={(v) => patchStation(station.id, "paddling_ideal", v)}
                      />
                    </td>
                    <td className="w-24 py-1">
                      <EditableCell
                        value={station.paddling_max}
                        label={`max flow for ${station.name}`}
                        onSave={(v) => patchStation(station.id, "paddling_max", v)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 && stations.length > 0 && (
              <p className="py-12 text-center text-foreground/40">
                No rivers match &ldquo;{filter}&rdquo;
              </p>
            )}
            {stations.length === 0 && (
              <p className="py-12 text-center text-foreground/40">No stations found</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
