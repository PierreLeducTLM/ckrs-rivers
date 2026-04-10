"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { setSubToken } from "../subscribe-button";
import { useTranslation } from "@/lib/i18n/provider";

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
  const { t } = useTranslation();
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
    const tk = params.get("token");
    setToken(tk);

    if (tk) {
      setSubToken(tk);
      fetch(`/api/notifications/manage?token=${tk}`)
        .then((res) => {
          if (!res.ok) throw new Error(t("notifications.invalidLink"));
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
      setError(t("notifications.noToken"));
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
        <p className="text-foreground/50">{t("app.loading")}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500">{error ?? t("notifications.somethingWrong")}</p>
          <Link href="/" className="mt-4 inline-block text-blue-500 hover:underline">
            {t("app.backToRivers")}
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

        <h1 className="mt-4 text-2xl font-bold">{t("notifications.title")}</h1>
        <p className="mt-1 text-sm text-foreground/50">{data.email}</p>

        {/* Subscribed stations */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("notifications.watchedRivers")}</h2>
          {data.subscriptions.length === 0 ? (
            <p className="mt-2 text-sm text-foreground/50">
              {t("notifications.noRivers")}
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
                    {sub.active ? t("notifications.active") : t("notifications.paused")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Global preferences */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("notifications.alertSettings")}</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="text-sm font-medium">{t("notifications.skillLevel")}</label>
              <select
                value={prefs.skillLevel}
                onChange={(e) => setPrefs((p) => ({ ...p, skillLevel: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-sm"
              >
                <option value="beginner">{t("notifications.beginner")}</option>
                <option value="intermediate">{t("notifications.intermediate")}</option>
                <option value="advanced">{t("notifications.advanced")}</option>
                <option value="expert">{t("notifications.expert")}</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">{t("notifications.advanceNotice")}</label>
              <select
                value={prefs.leadTimeDays}
                onChange={(e) => setPrefs((p) => ({ ...p, leadTimeDays: Number(e.target.value) }))}
                className="mt-1 block w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-sm"
              >
                <option value={1}>{t("notifications.daysBefore", { n: 1 })}</option>
                <option value={2}>{t("notifications.daysBeforePlural", { n: 2 })}</option>
                <option value={3}>{t("notifications.daysBeforePlural", { n: 3 })}</option>
                <option value={5}>{t("notifications.daysBeforePlural", { n: 5 })}</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">{t("notifications.forecastConfidence")}</label>
              <select
                value={prefs.confidenceThreshold}
                onChange={(e) => setPrefs((p) => ({ ...p, confidenceThreshold: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-sm"
              >
                <option value="high">{t("notifications.highOnly")}</option>
                <option value="medium">{t("notifications.mediumAndHigh")}</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">{t("notifications.flowRange")}</label>
              <select
                value={prefs.acceptableRange}
                onChange={(e) => setPrefs((p) => ({ ...p, acceptableRange: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-sm"
              >
                <option value="optimal-only">{t("notifications.optimalOnly")}</option>
                <option value="runnable">{t("notifications.allRunnable")}</option>
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
                <span className="text-sm">{t("notifications.digestMode")}</span>
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={prefs.weekendOnly}
                  onChange={(e) => setPrefs((p) => ({ ...p, weekendOnly: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                <span className="text-sm">{t("notifications.weekendOnly")}</span>
              </label>
            </div>

            <button
              onClick={savePreferences}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? t("notifications.saving") : t("notifications.savePreferences")}
            </button>
          </div>
        </section>

        {/* Recent notifications */}
        {data.recentNotifications.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">{t("notifications.recentNotifications")}</h2>
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
                      : t("notifications.pending")}
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
              if (!confirm(t("notifications.unsubscribeConfirm"))) return;
              await fetch(`/api/notifications/unsubscribe?token=${token}`, {
                method: "DELETE",
              });
              window.location.href = "/";
            }}
            className="text-sm text-red-500 hover:underline"
          >
            {t("notifications.unsubscribeAll")}
          </button>
        </section>
      </div>
    </div>
  );
}
