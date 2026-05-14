"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface LocalCamera {
  id: string;
  provider: string;
  provider_camera_id: string | null;
  provider_account_id: string | null;
  name: string;
  station_id: string | null;
  active: boolean;
  last_synced_photo_date: string | null;
  station_name: string | null;
  latest_reading_value: number | null;
  latest_reading_confidence: string | null;
  latest_captured_at: string | null;
}

interface UnassignedSpypoint {
  id: string;
  name: string;
  model: string | null;
  isOnline: boolean;
}

interface CamerasResponse {
  local: LocalCamera[];
  unassignedSpypoint: UnassignedSpypoint[];
  spypointError: string | null;
}

interface BlinkAccount {
  id: string;
  label: string;
  username: string;
  pending2fa: boolean;
  hasTokens: boolean;
  lastUsedAt: string | null;
  lastError: string | null;
}

interface BlinkCameraOption {
  id: string;
  name: string;
  networkId: string;
  type: string;
  model: string | null;
}

export default function CamerasAdminPage() {
  const [data, setData] = useState<CamerasResponse | null>(null);
  const [accounts, setAccounts] = useState<BlinkAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);

  // Per-account Blink camera list (loaded on expand) and the
  // currently-expanded account id.
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [accountCameras, setAccountCameras] = useState<Record<string, BlinkCameraOption[]>>({});
  const [diagnostics, setDiagnostics] = useState<Record<string, string>>({});

  // Add-Blink-account form state
  const [showBlinkForm, setShowBlinkForm] = useState(false);
  const [blinkLabel, setBlinkLabel] = useState("");
  const [blinkUsername, setBlinkUsername] = useState("");
  const [blinkPassword, setBlinkPassword] = useState("");
  const [blinkSubmitting, setBlinkSubmitting] = useState(false);
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [blinkPin, setBlinkPin] = useState("");

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [camerasRes, accountsRes] = await Promise.all([
        fetch("/api/admin/cameras", { cache: "no-store" }),
        fetch("/api/admin/cameras/blink/accounts", { cache: "no-store" }),
      ]);
      if (camerasRes.ok) setData((await camerasRes.json()) as CamerasResponse);
      else {
        const body = (await camerasRes.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Failed to load cameras");
      }
      if (accountsRes.ok) {
        const body = (await accountsRes.json()) as { accounts: BlinkAccount[] };
        setAccounts(body.accounts);
      }
    } catch {
      setError("Network error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function importSpypointCamera(providerCameraId: string) {
    const key = `spypoint:${providerCameraId}`;
    setImporting(key);
    try {
      const res = await fetch("/api/admin/cameras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "spypoint", providerCameraId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Failed to import camera");
        return;
      }
      await refresh();
    } finally {
      setImporting(null);
    }
  }

  async function importBlinkCamera(accountId: string, providerCameraId: string, name: string) {
    const key = `blink:${providerCameraId}`;
    setImporting(key);
    try {
      const res = await fetch("/api/admin/cameras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "blink", providerCameraId, providerAccountId: accountId, name }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Failed to import camera");
        return;
      }
      await refresh();
    } finally {
      setImporting(null);
    }
  }

  async function expandAccount(accountId: string) {
    if (expandedAccount === accountId) {
      setExpandedAccount(null);
      return;
    }
    setExpandedAccount(accountId);
    if (!accountCameras[accountId]) {
      try {
        const res = await fetch(`/api/admin/cameras/blink/accounts/${accountId}`, { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { cameras: BlinkCameraOption[] };
          setAccountCameras((prev) => ({ ...prev, [accountId]: body.cameras }));
        }
      } catch {
        // ignore — UI will show empty list
      }
    }
  }

  async function submitBlinkLogin(e: React.FormEvent) {
    e.preventDefault();
    setBlinkSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cameras/blink/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: blinkLabel || undefined, username: blinkUsername, password: blinkPassword }),
      });
      const body = (await res.json()) as { success?: boolean; accountId?: string; pending2fa?: boolean; message?: string; error?: string; blinkResponse?: string | null };
      if (res.status === 202 && body.pending2fa && body.accountId) {
        setPendingAccountId(body.accountId);
        return;
      }
      if (!res.ok) {
        const msg = body.blinkResponse ? `${body.error ?? "Login failed"} — ${body.blinkResponse}` : (body.error ?? "Login failed");
        setError(msg);
        return;
      }
      // Success without 2FA — close form and refresh
      setShowBlinkForm(false);
      setBlinkLabel("");
      setBlinkUsername("");
      setBlinkPassword("");
      await refresh();
    } finally {
      setBlinkSubmitting(false);
    }
  }

  async function submitBlinkPin(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingAccountId) return;
    setBlinkSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cameras/blink/accounts/${pendingAccountId}/verify-2fa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: blinkPin }),
      });
      const body = (await res.json()) as { success?: boolean; error?: string; blinkResponse?: string | null };
      if (!res.ok) {
        const msg = body.blinkResponse ? `${body.error ?? "Verification failed"} — ${body.blinkResponse}` : (body.error ?? "Verification failed");
        setError(msg);
        return;
      }
      // Done — reset and refresh
      setShowBlinkForm(false);
      setPendingAccountId(null);
      setBlinkLabel("");
      setBlinkUsername("");
      setBlinkPassword("");
      setBlinkPin("");
      await refresh();
    } finally {
      setBlinkSubmitting(false);
    }
  }

  async function diagnoseBlinkAccount(accountId: string) {
    setDiagnostics((prev) => ({ ...prev, [accountId]: "Loading…" }));
    try {
      const res = await fetch(`/api/admin/cameras/blink/accounts/${accountId}/diagnose`, { cache: "no-store" });
      const body = await res.json();
      setDiagnostics((prev) => ({ ...prev, [accountId]: JSON.stringify(body, null, 2) }));
    } catch (err) {
      setDiagnostics((prev) => ({ ...prev, [accountId]: `Error: ${err instanceof Error ? err.message : String(err)}` }));
    }
  }

  async function deleteBlinkAccount(accountId: string) {
    if (!confirm("Delete this Blink account? Cameras assigned to it will need to be reassigned.")) return;
    const res = await fetch(`/api/admin/cameras/blink/accounts/${accountId}`, { method: "DELETE" });
    if (res.ok) await refresh();
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">Cameras</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Field cameras (Spypoint, Blink). Each can be assigned to a river to provide a visual
          water-level reading.
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">
            {error}
          </div>
        )}

        {data === null && (
          <div className="mt-6 h-24 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        )}

        {data && (
          <>
            <section className="mt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Configured ({data.local.length})
              </h2>
              {data.local.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">No cameras imported yet.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {data.local.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {c.name}
                          </h3>
                          <p className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                            <span className="rounded bg-zinc-200 px-1.5 py-0.5 font-semibold uppercase tracking-wider text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                              {c.provider}
                            </span>
                            <span className="font-mono">{c.provider_camera_id ?? "—"}</span>
                          </p>
                          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                            River:{" "}
                            {c.station_name ? (
                              <Link
                                href={`/rivers/${c.station_id}`}
                                className="underline hover:text-zinc-900 dark:hover:text-zinc-100"
                              >
                                {c.station_name}
                              </Link>
                            ) : (
                              <span className="italic">unassigned</span>
                            )}
                          </p>
                          {c.latest_captured_at && (
                            <p className="mt-1 text-xs text-zinc-500">
                              Latest:{" "}
                              {c.latest_reading_value != null
                                ? c.latest_reading_value.toFixed(2)
                                : "—"}{" "}
                              <span className="text-zinc-400">
                                ({c.latest_reading_confidence ?? "—"})
                              </span>{" "}
                              · {new Date(c.latest_captured_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                        <Link
                          href={`/admin/cameras/${c.id}`}
                          className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          Edit
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-8">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Available on Spypoint ({data.unassignedSpypoint.length})
              </h2>
              {data.spypointError && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  Spypoint API: {data.spypointError}
                </p>
              )}
              {!data.spypointError && data.unassignedSpypoint.length === 0 && (
                <p className="mt-3 text-sm text-zinc-500">All Spypoint cameras are already imported.</p>
              )}
              {data.unassignedSpypoint.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {data.unassignedSpypoint.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-4 rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{c.name}</p>
                        <p className="font-mono text-[11px] text-zinc-500">
                          {c.id} {c.model && `· ${c.model}`} {c.isOnline ? "· online" : "· offline"}
                        </p>
                      </div>
                      <button
                        onClick={() => importSpypointCamera(c.id)}
                        disabled={importing === `spypoint:${c.id}`}
                        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                      >
                        {importing === `spypoint:${c.id}` ? "Importing..." : "Import"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-8">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Blink accounts ({accounts?.length ?? 0})
                </h2>
                {!showBlinkForm && (
                  <button
                    onClick={() => setShowBlinkForm(true)}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    + Add Blink account
                  </button>
                )}
              </div>

              {showBlinkForm && (
                <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  {!pendingAccountId ? (
                    <form onSubmit={submitBlinkLogin} className="space-y-3">
                      <p className="text-xs text-zinc-500">
                        Sign in once with your Blink credentials. We&apos;ll store a refresh token so the
                        cron job can stay logged in.
                      </p>
                      <input
                        type="text"
                        placeholder="Label (e.g. Personal Blink)"
                        value={blinkLabel}
                        onChange={(e) => setBlinkLabel(e.target.value)}
                        className="block w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      />
                      <input
                        type="email"
                        placeholder="Blink account email"
                        value={blinkUsername}
                        onChange={(e) => setBlinkUsername(e.target.value)}
                        required
                        className="block w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      />
                      <input
                        type="password"
                        placeholder="Password"
                        value={blinkPassword}
                        onChange={(e) => setBlinkPassword(e.target.value)}
                        required
                        className="block w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={blinkSubmitting}
                          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                        >
                          {blinkSubmitting ? "Signing in…" : "Sign in"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowBlinkForm(false);
                            setBlinkLabel("");
                            setBlinkUsername("");
                            setBlinkPassword("");
                          }}
                          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form onSubmit={submitBlinkPin} className="space-y-3">
                      <p className="text-xs text-zinc-500">
                        Blink emailed a 2FA pin to <span className="font-medium">{blinkUsername}</span>.
                        Enter it below.
                      </p>
                      <input
                        type="text"
                        placeholder="Pin from email"
                        value={blinkPin}
                        onChange={(e) => setBlinkPin(e.target.value)}
                        required
                        autoFocus
                        inputMode="numeric"
                        className="block w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={blinkSubmitting}
                          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                        >
                          {blinkSubmitting ? "Verifying…" : "Verify pin"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPendingAccountId(null);
                            setBlinkPin("");
                          }}
                          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          Back
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {accounts && accounts.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {accounts.map((a) => {
                    const importedKeys = new Set(
                      data.local
                        .filter((c) => c.provider === "blink" && c.provider_account_id === a.id)
                        .map((c) => c.provider_camera_id),
                    );
                    const cams = accountCameras[a.id] ?? [];
                    return (
                      <li
                        key={a.id}
                        className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                              {a.label}{" "}
                              {a.pending2fa && (
                                <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                                  2FA pending
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-zinc-500">{a.username}</p>
                            {a.lastError && (
                              <p className="mt-0.5 text-[11px] text-amber-600">{a.lastError}</p>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            {a.hasTokens && (
                              <button
                                onClick={() => expandAccount(a.id)}
                                className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                              >
                                {expandedAccount === a.id ? "Hide" : "Cameras"}
                              </button>
                            )}
                            {a.hasTokens && (
                              <button
                                onClick={() => diagnoseBlinkAccount(a.id)}
                                className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                              >
                                Diagnose
                              </button>
                            )}
                            <button
                              onClick={() => deleteBlinkAccount(a.id)}
                              className="rounded-lg border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
                            >
                              Remove
                            </button>
                          </div>
                        </div>

                        {diagnostics[a.id] && (
                          <pre className="mt-3 max-h-96 overflow-auto rounded border border-zinc-300 bg-zinc-50 p-2 text-[10px] leading-snug text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                            {diagnostics[a.id]}
                          </pre>
                        )}

                        {expandedAccount === a.id && (
                          <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                            {cams.length === 0 ? (
                              <p className="text-xs text-zinc-500">No cameras found on this account.</p>
                            ) : (
                              <ul className="space-y-1.5">
                                {cams.map((cam) => {
                                  const already = importedKeys.has(cam.id);
                                  return (
                                    <li
                                      key={cam.id}
                                      className="flex items-center justify-between gap-3 rounded border border-dashed border-zinc-300 p-2 dark:border-zinc-700"
                                    >
                                      <div className="min-w-0">
                                        <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                                          {cam.name}
                                        </p>
                                        <p className="font-mono text-[10px] text-zinc-500">
                                          {cam.id} · {cam.type}
                                          {cam.model && ` · ${cam.model}`}
                                        </p>
                                      </div>
                                      {already ? (
                                        <span className="text-[11px] text-zinc-500">Imported</span>
                                      ) : (
                                        <button
                                          onClick={() => importBlinkCamera(a.id, cam.id, cam.name)}
                                          disabled={importing === `blink:${cam.id}`}
                                          className="rounded bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                                        >
                                          {importing === `blink:${cam.id}` ? "Importing…" : "Import"}
                                        </button>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
