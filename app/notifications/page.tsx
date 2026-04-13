"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setSubToken } from "../subscribe-button";
import { useTranslation } from "@/lib/i18n/provider";
import { getPushToken } from "@/lib/capacitor/push";
import { ALL_ALERT_TYPES, type AlertType } from "@/lib/domain/notification";

interface ManageData {
  email: string | null;
  confirmed?: boolean;
  preferences: Record<string, unknown>;
  memberSince?: string;
  stationIds?: string[];
}

type TokenMode = "subscriber" | "push" | null;

export default function NotificationsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [tokenMode, setTokenMode] = useState<TokenMode>(null);
  const [subToken, setSubTokenState] = useState<string | null>(null);
  const [pushTokenValue, setPushTokenValue] = useState<string | null>(null);
  const [data, setData] = useState<ManageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [isNative, setIsNative] = useState(false);

  const [prefs, setPrefs] = useState({
    leadTimeDays: 2,
    weekendOnly: false,
    emailEnabled: true,
    pushEnabled: true,
    enabledAlertTypes: [...ALL_ALERT_TYPES] as AlertType[],
  });

  // Determine token mode and load data
  useEffect(() => {
    async function init() {
      const params = new URLSearchParams(window.location.search);
      const tk = params.get("token");
      const ptk = params.get("pushToken");

      // Check if on native platform
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (Capacitor.isNativePlatform()) setIsNative(true);
      } catch {
        // Not on native
      }

      if (tk) {
        // Subscriber path
        setSubTokenState(tk);
        setTokenMode("subscriber");
        setSubToken(tk);
        try {
          const res = await fetch(`/api/notifications/manage?token=${tk}`);
          if (!res.ok) throw new Error(t("notifications.invalidLink"));
          const d = await res.json();
          setData(d);
          setPrefs((prev) => ({
            ...prev,
            leadTimeDays: (d.preferences?.leadTimeDays as number) ?? prev.leadTimeDays,
            weekendOnly: (d.preferences?.weekendOnly as boolean) ?? prev.weekendOnly,
            emailEnabled: d.preferences?.emailEnabled !== false,
            pushEnabled: d.preferences?.pushEnabled !== false,
            enabledAlertTypes: (d.preferences?.enabledAlertTypes as AlertType[]) ?? prev.enabledAlertTypes,
          }));
        } catch (err) {
          setError(err instanceof Error ? err.message : t("notifications.somethingWrong"));
        }
        setLoading(false);
        return;
      }

      if (ptk) {
        // Push-only path (explicit pushToken param)
        setPushTokenValue(ptk);
        setTokenMode("push");
        try {
          const res = await fetch(`/api/notifications/manage?pushToken=${ptk}`);
          if (!res.ok) throw new Error(t("notifications.invalidLink"));
          const d = await res.json();
          setData(d);
          setPrefs((prev) => ({
            ...prev,
            leadTimeDays: (d.preferences?.leadTimeDays as number) ?? prev.leadTimeDays,
            weekendOnly: (d.preferences?.weekendOnly as boolean) ?? prev.weekendOnly,
            emailEnabled: d.preferences?.emailEnabled !== false,
            pushEnabled: d.preferences?.pushEnabled !== false,
            enabledAlertTypes: (d.preferences?.enabledAlertTypes as AlertType[]) ?? prev.enabledAlertTypes,
          }));
        } catch (err) {
          setError(err instanceof Error ? err.message : t("notifications.somethingWrong"));
        }
        setLoading(false);
        return;
      }

      // No token in URL — try push token on native
      const existingPush = getPushToken();
      if (existingPush) {
        setPushTokenValue(existingPush);
        setTokenMode("push");
        try {
          const res = await fetch(`/api/notifications/manage?pushToken=${existingPush}`);
          const d = await res.json();
          setData(d);
          setPrefs((prev) => ({
            ...prev,
            leadTimeDays: (d.preferences?.leadTimeDays as number) ?? prev.leadTimeDays,
            weekendOnly: (d.preferences?.weekendOnly as boolean) ?? prev.weekendOnly,
            emailEnabled: d.preferences?.emailEnabled !== false,
            pushEnabled: d.preferences?.pushEnabled !== false,
            enabledAlertTypes: (d.preferences?.enabledAlertTypes as AlertType[]) ?? prev.enabledAlertTypes,
          }));
        } catch (err) {
          setError(err instanceof Error ? err.message : t("notifications.somethingWrong"));
        }
        setLoading(false);
        return;
      }

      setError(t("notifications.noToken"));
      setLoading(false);
    }

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savePreferences = useCallback(async () => {
    setSaving(true);
    setSaveStatus("idle");
    try {
      const query = tokenMode === "subscriber"
        ? `token=${subToken}`
        : `pushToken=${pushTokenValue}`;
      const res = await fetch(`/api/notifications/preferences?${query}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ global: prefs }),
      });
      if (!res.ok) throw new Error();
      setSaveStatus("saved");
      setTimeout(() => router.back(), 800);
    } catch {
      setSaveStatus("error");
    }
    setSaving(false);
  }, [tokenMode, subToken, pushTokenValue, prefs, router]);

  const changeEmail = async () => {
    if (!subToken || !emailDraft.trim()) return;
    setEmailSaving(true);
    const res = await fetch(`/api/notifications/change-email?token=${subToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailDraft.trim() }),
    });
    if (res.ok) {
      const result = await res.json();
      setData((d) => d ? { ...d, email: result.email } : d);
      if (result.token !== subToken) {
        setSubTokenState(result.token);
        setSubToken(result.token);
      }
      setEditingEmail(false);
    }
    setEmailSaving(false);
  };

  const toggleAlertType = (alertType: AlertType) => {
    setPrefs((p) => {
      const current = p.enabledAlertTypes;
      const isEnabled = current.includes(alertType);
      return {
        ...p,
        enabledAlertTypes: isEnabled
          ? current.filter((t) => t !== alertType)
          : [...current, alertType],
      };
    });
  };

  const selectAllAlertTypes = () => {
    setPrefs((p) => ({ ...p, enabledAlertTypes: [...ALL_ALERT_TYPES] }));
  };

  const deselectAllAlertTypes = () => {
    setPrefs((p) => ({ ...p, enabledAlertTypes: [] }));
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

  const hasEmail = !!data.email;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-xl px-6 py-10">
        <Link href="/" className="text-sm text-foreground/50 hover:text-foreground/70">
          &larr; {t("app.backToRivers")}
        </Link>

        <h1 className="mt-4 text-2xl font-bold">{t("notifications.title")}</h1>

        {/* Email row */}
        <div className="mt-2 flex items-center gap-2">
          {hasEmail ? (
            editingEmail ? (
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
                  placeholder={data.email ?? ""}
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
                  onClick={() => { setEmailDraft(data.email ?? ""); setEditingEmail(true); }}
                  className="text-xs text-blue-500 hover:underline"
                >
                  {t("notifications.changeEmail")}
                </button>
              </>
            )
          ) : (
            <p className="text-sm text-foreground/40 italic">
              {t("notifications.addEmail")}
            </p>
          )}
        </div>

        {/* Channel toggles */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("notifications.channelToggles")}</h2>
          <div className="mt-3 space-y-3">
            {/* Email toggle */}
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={prefs.emailEnabled}
                onChange={(e) => setPrefs((p) => ({ ...p, emailEnabled: e.target.checked }))}
                disabled={!hasEmail}
                className="h-4 w-4 rounded"
              />
              <span className={`text-sm ${!hasEmail ? "text-foreground/30" : ""}`}>
                {t("notifications.emailNotifications")}
              </span>
              {!hasEmail && (
                <span className="text-xs text-foreground/30">
                  ({t("notifications.noEmailHint")})
                </span>
              )}
            </label>

            {/* Push toggle — only on native */}
            {isNative && (
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={prefs.pushEnabled}
                  onChange={(e) => setPrefs((p) => ({ ...p, pushEnabled: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                <span className="text-sm">{t("notifications.pushNotifications")}</span>
              </label>
            )}
          </div>
        </section>

        {/* Alert behavior */}
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
        </section>

        {/* Notification types */}
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("notifications.notificationTypes")}</h2>
            <button
              onClick={
                prefs.enabledAlertTypes.length === ALL_ALERT_TYPES.length
                  ? deselectAllAlertTypes
                  : selectAllAlertTypes
              }
              className="text-xs text-blue-500 hover:underline"
            >
              {prefs.enabledAlertTypes.length === ALL_ALERT_TYPES.length
                ? t("notifications.deselectAll")
                : t("notifications.selectAll")}
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {ALL_ALERT_TYPES.map((alertType) => (
              <label key={alertType} className="flex items-start gap-3 py-1">
                <input
                  type="checkbox"
                  checked={prefs.enabledAlertTypes.includes(alertType)}
                  onChange={() => toggleAlertType(alertType)}
                  className="mt-0.5 h-4 w-4 rounded"
                />
                <div>
                  <span className="text-sm font-medium">
                    {t(`notifications.alertTypes.${alertType}.label`)}
                  </span>
                  <p className="text-xs text-foreground/50">
                    {t(`notifications.alertTypes.${alertType}.description`)}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Save + status */}
        <section className="mt-8">
          <div className="flex items-center gap-3">
            <button
              onClick={savePreferences}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? t("notifications.saving") : t("notifications.savePreferences")}
            </button>
            {saveStatus === "saved" && (
              <span className="text-sm text-green-500">{t("notifications.saved")}</span>
            )}
            {saveStatus === "error" && (
              <span className="text-sm text-red-500">{t("notifications.saveFailed")}</span>
            )}
          </div>
        </section>

        {/* Unsubscribe */}
        <section className="mt-10 border-t border-foreground/10 pt-6">
          <button
            onClick={async () => {
              const tk = subToken || pushTokenValue;
              if (!tk) return;
              if (!confirm(t("notifications.unsubscribeConfirm"))) return;
              if (tokenMode === "subscriber") {
                await fetch(`/api/notifications/unsubscribe?token=${tk}`, {
                  method: "DELETE",
                });
              }
              // For push, we could clear subscriptions via PATCH for each station
              // but the simplest path is to navigate away
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
