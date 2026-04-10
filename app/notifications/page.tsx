"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setSubToken } from "../subscribe-button";
import { useTranslation } from "@/lib/i18n/provider";

interface ManageData {
  email: string;
  confirmed: boolean;
  preferences: Record<string, unknown>;
  memberSince: string;
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<ManageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [prefs, setPrefs] = useState({
    leadTimeDays: 2,
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

  const savePreferences = async () => {
    if (!token) return;
    setSaving(true);
    await fetch(`/api/notifications/preferences?token=${token}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ global: prefs }),
    });
    setSaving(false);
    router.back();
  };

  const changeEmail = async () => {
    if (!token || !emailDraft.trim()) return;
    setEmailSaving(true);
    const res = await fetch(`/api/notifications/change-email?token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailDraft.trim() }),
    });
    if (res.ok) {
      const result = await res.json();
      setData((d) => d ? { ...d, email: result.email } : d);
      if (result.token !== token) {
        setToken(result.token);
        setSubToken(result.token);
      }
      setEditingEmail(false);
    }
    setEmailSaving(false);
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

        {/* Email */}
        <div className="mt-2 flex items-center gap-2">
          {editingEmail ? (
            <>
              <input
                type="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") changeEmail();
                  if (e.key === "Escape") setEditingEmail(false);
                }}
                autoFocus
                disabled={emailSaving}
                className="rounded-lg border border-foreground/20 bg-transparent px-3 py-1.5 text-sm"
                placeholder={data.email}
              />
              <button
                onClick={changeEmail}
                disabled={emailSaving}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {emailSaving ? "..." : "OK"}
              </button>
              <button
                onClick={() => setEditingEmail(false)}
                disabled={emailSaving}
                className="text-xs text-foreground/50 hover:text-foreground/70"
              >
                &times;
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-foreground/50">{data.email}</p>
              <button
                onClick={() => { setEmailDraft(data.email); setEditingEmail(true); }}
                className="text-xs text-blue-500 hover:underline"
              >
                {t("notifications.changeEmail")}
              </button>
            </>
          )}
        </div>

        {/* Global preferences */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("notifications.alertSettings")}</h2>
          <div className="mt-4 space-y-4">
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

            <div className="space-y-3">
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
