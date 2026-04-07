"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { setSubToken } from "../subscribe-button";

interface Subscription {
  id: string;
  stationId: string;
  stationName: string;
  active: boolean;
  preferences: Record<string, unknown> | null;
}

interface Notification {
  alert_type: string;
  priority: string;
  subject: string;
  sent_at: string | null;
  delivered: boolean | null;
  station_name: string | null;
}

interface ManageData {
  email: string;
  confirmed: boolean;
  preferences: Record<string, unknown>;
  memberSince: string;
  subscriptions: Subscription[];
  recentNotifications: Notification[];
}

export default function NotificationsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<ManageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState({
    skillLevel: "intermediate",
    leadTimeDays: 2,
    confidenceThreshold: "high",
    acceptableRange: "runnable",
    digestMode: false,
    weekendOnly: false,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    setToken(t);

    if (t) {
      setSubToken(t);
      fetch(`/api/notifications/manage?token=${t}`)
        .then((res) => {
          if (!res.ok) throw new Error("Invalid or expired link");
          return res.json();
        })
        .then((d: ManageData) => {
          setData(d);
          setPrefs((prev) => ({ ...prev, ...d.preferences }));
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
    } else {
      setError("No token provided. Use the link from your confirmation email.");
      setLoading(false);
    }
  }, []);

  const toggleSubscription = async (stationId: string, active: boolean) => {
    if (!token) return;
    if (active) {
      await fetch(`/api/notifications/subscribe-station?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationId }),
      });
    } else {
      await fetch(`/api/notifications/unsubscribe?token=${token}&stationId=${stationId}`, {
        method: "DELETE",
      });
    }
    // Refresh data
    const res = await fetch(`/api/notifications/manage?token=${token}`);
    if (res.ok) setData(await res.json());
  };

  const savePreferences = async () => {
    if (!token) return;
    setSaving(true);
    await fetch(`/api/notifications/preferences?token=${token}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ global: prefs }),
    });
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <p className="text-foreground/50">Loading...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500">{error ?? "Something went wrong"}</p>
          <Link href="/" className="mt-4 inline-block text-blue-500 hover:underline">
            Back to Rivers
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-xl px-6 py-10">
        <Link href="/" className="text-sm text-foreground/50 hover:text-foreground/70">
          &larr; Back to Rivers
        </Link>

        <h1 className="mt-4 text-2xl font-bold">Notification Preferences</h1>
        <p className="mt-1 text-sm text-foreground/50">{data.email}</p>

        {/* Subscribed stations */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Watched Rivers</h2>
          {data.subscriptions.length === 0 ? (
            <p className="mt-2 text-sm text-foreground/50">
              No rivers subscribed yet. Click the bell icon on a river card to subscribe.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {data.subscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between rounded-lg border border-foreground/10 px-4 py-3"
                >
                  <div>
                    <p className="font-medium">{sub.stationName}</p>
                    <p className="text-xs text-foreground/50">Station {sub.stationId}</p>
                  </div>
                  <button
                    onClick={() => toggleSubscription(sub.stationId, !sub.active)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      sub.active
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-foreground/10 text-foreground/50"
                    }`}
                  >
                    {sub.active ? "Active" : "Paused"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Global preferences */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Alert Settings</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="text-sm font-medium">Skill Level</label>
              <select
                value={prefs.skillLevel}
                onChange={(e) => setPrefs((p) => ({ ...p, skillLevel: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-sm"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="expert">Expert</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Advance Notice</label>
              <select
                value={prefs.leadTimeDays}
                onChange={(e) => setPrefs((p) => ({ ...p, leadTimeDays: Number(e.target.value) }))}
                className="mt-1 block w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-sm"
              >
                <option value={1}>1 day before</option>
                <option value={2}>2 days before</option>
                <option value={3}>3 days before</option>
                <option value={5}>5 days before</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Forecast Confidence</label>
              <select
                value={prefs.confidenceThreshold}
                onChange={(e) => setPrefs((p) => ({ ...p, confidenceThreshold: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-sm"
              >
                <option value="high">High confidence only</option>
                <option value="medium">Medium and high</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Flow Range</label>
              <select
                value={prefs.acceptableRange}
                onChange={(e) => setPrefs((p) => ({ ...p, acceptableRange: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-sm"
              >
                <option value="optimal-only">Optimal only (ideal conditions)</option>
                <option value="runnable">All runnable (includes low/high runnable)</option>
              </select>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={prefs.digestMode}
                  onChange={(e) => setPrefs((p) => ({ ...p, digestMode: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                <span className="text-sm">Batch alerts into a daily digest</span>
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={prefs.weekendOnly}
                  onChange={(e) => setPrefs((p) => ({ ...p, weekendOnly: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                <span className="text-sm">Weekend windows only (Fri-Sun)</span>
              </label>
            </div>

            <button
              onClick={savePreferences}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Preferences"}
            </button>
          </div>
        </section>

        {/* Recent notifications */}
        {data.recentNotifications.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Recent Notifications</h2>
            <div className="mt-3 space-y-2">
              {data.recentNotifications.map((n, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-foreground/10 px-4 py-3"
                >
                  <p className="text-sm font-medium">{n.subject}</p>
                  <p className="text-xs text-foreground/50">
                    {n.station_name && `${n.station_name} · `}
                    {n.sent_at
                      ? new Date(n.sent_at).toLocaleDateString("en-CA", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Pending"}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Unsubscribe */}
        <section className="mt-10 border-t border-foreground/10 pt-6">
          <button
            onClick={async () => {
              if (!token) return;
              if (!confirm("Unsubscribe from all river notifications?")) return;
              await fetch(`/api/notifications/unsubscribe?token=${token}`, {
                method: "DELETE",
              });
              window.location.href = "/";
            }}
            className="text-sm text-red-500 hover:underline"
          >
            Unsubscribe from all notifications
          </button>
        </section>
      </div>
    </div>
  );
}
