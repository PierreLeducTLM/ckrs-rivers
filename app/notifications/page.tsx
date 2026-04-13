"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setSubToken } from "../subscribe-button";
import { useTranslation } from "@/lib/i18n/provider";
import { ALL_ALERT_TYPES, type AlertType } from "@/lib/domain/notification";
import { initPushNotifications } from "@/lib/capacitor/push";

interface ManageData {
  email: string | null;
  confirmed: boolean;
  preferences: Record<string, unknown>;
  memberSince: string;
  pushDevice?: { platform: string; stationIds: string[] };
}

interface Prefs {
  leadTimeDays: number;
  weekendOnly: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  enabledAlertTypes: AlertType[];
}

const DEFAULT_PREFS: Prefs = {
  leadTimeDays: 2,
  weekendOnly: false,
  emailEnabled: true,
  pushEnabled: true,
  enabledAlertTypes: [...ALL_ALERT_TYPES],
};

/** Dotted translation key for each alert type's friendly label/description. */
const ALERT_TYPE_I18N_KEY: Record<AlertType, string> = {
  "its-on": "itsOn",
  "safety-warning": "safetyWarning",
  "runnable-in-n-days": "runnableInNDays",
  "weekend-forecast": "weekendForecast",
  "rain-bump": "rainBump",
  "confidence-upgraded": "confidenceUpgraded",
  "rising-into-range": "risingIntoRange",
  "dropping-out": "droppingOut",
};

export default function NotificationsPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [subscriberToken, setSubscriberTokenState] = useState<string | null>(null);
  const [pushToken, setPushTokenState] = useState<string | null>(null);
  const [data, setData] = useState<ManageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  // ----- Load on mount -----
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const urlSub = params.get("token");
      const urlPush = params.get("pushToken");

      const sub = urlSub;
      let push = urlPush;

      // On native, try to resolve the push token if not already in URL.
      if (!push) {
        try {
          push = await initPushNotifications();
        } catch {
          push = null;
        }
      }

      if (!sub && !push) {
        if (cancelled) return;
        setError(t("notifications.noToken"));
        setLoading(false);
        return;
      }

      setSubscriberTokenState(sub);
      setPushTokenState(push);
      if (sub) setSubToken(sub);

      const qs = new URLSearchParams();
      if (sub) qs.set("token", sub);
      if (push) qs.set("pushToken", push);

      try {
        const res = await fetch(`/api/notifications/manage?${qs.toString()}`);
        if (!res.ok) throw new Error(t("notifications.invalidLink"));
        const d = (await res.json()) as ManageData & { subscriberToken?: string };

        if (cancelled) return;

        setData(d);
        setPrefs((prev) => ({ ...prev, ...(d.preferences as Partial<Prefs>) }));
        // If the device was linked to an existing subscriber, surface their token too.
        if (d.subscriberToken && !sub) {
          setSubscriberTokenState(d.subscriberToken);
          setSubToken(d.subscriberToken);
        }
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("notifications.somethingWrong"));
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [t]);

  // ----- Save preferences -----
  const savePreferences = useCallback(async () => {
    setSaving(true);
    setSaveStatus("idle");

    const qs = new URLSearchParams();
    if (subscriberToken) qs.set("token", subscriberToken);
    if (pushToken) qs.set("pushToken", pushToken);

    try {
      const res = await fetch(`/api/notifications/preferences?${qs.toString()}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ global: prefs }),
      });

      if (!res.ok) {
        setSaveStatus("error");
        setSaving(false);
        return;
      }

      setSaveStatus("saved");
      setSaving(false);

      // Give the user a moment to see "Saved" before navigating back.
      setTimeout(() => {
        router.back();
      }, 600);
    } catch {
      setSaveStatus("error");
      setSaving(false);
    }
  }, [prefs, subscriberToken, pushToken, router]);

  // ----- Change / set email -----
  const saveEmail = useCallback(async () => {
    const draft = emailDraft.trim().toLowerCase();
    if (!draft || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft)) {
      setEmailError(t("notifications.saveFailed"));
      return;
    }

    setEmailSaving(true);
    setEmailError(null);

    try {
      // Existing subscriber → change-email endpoint.
      if (subscriberToken) {
        const res = await fetch(`/api/notifications/change-email?token=${subscriberToken}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: draft }),
        });
        if (!res.ok) throw new Error("change-email failed");
        const result = (await res.json()) as { email: string; token: string };
        setData((d) => (d ? { ...d, email: result.email } : d));
        if (result.token !== subscriberToken) {
          setSubscriberTokenState(result.token);
          setSubToken(result.token);
        }
        setEditingEmail(false);
      } else {
        // Push-only → create/find subscriber via /api/notifications/subscribe,
        // passing the pushToken so it auto-confirms and links the device.
        const subRes = await fetch(`/api/notifications/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: draft, pushToken }),
        });
        if (!subRes.ok) throw new Error("subscribe failed");
        const subResult = (await subRes.json()) as { token?: string };

        if (!subResult.token) throw new Error("no token returned");

        setSubscriberTokenState(subResult.token);
        setSubToken(subResult.token);
        setData((d) => (d ? { ...d, email: draft, confirmed: true } : d));
        setEditingEmail(false);
      }
    } catch {
      setEmailError(t("notifications.saveFailed"));
    } finally {
      setEmailSaving(false);
    }
  }, [emailDraft, subscriberToken, pushToken, t]);

  // ----- Helpers -----
  const togglePref = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  };

  const toggleAlertType = (type: AlertType) => {
    setPrefs((p) => {
      const set = new Set(p.enabledAlertTypes);
      if (set.has(type)) set.delete(type);
      else set.add(type);
      return { ...p, enabledAlertTypes: Array.from(set) };
    });
  };

  const selectAllAlertTypes = () =>
    setPrefs((p) => ({ ...p, enabledAlertTypes: [...ALL_ALERT_TYPES] }));

  const deselectAllAlertTypes = () =>
    setPrefs((p) => ({ ...p, enabledAlertTypes: [] }));

  // ----- Render states -----
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
  const isNative = !!pushToken;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-xl px-6 py-10">
        <Link href="/" className="text-sm text-foreground/50 hover:text-foreground/70">
          &larr; {t("app.backToRivers")}
        </Link>

        <h1 className="mt-4 text-2xl font-bold">{t("notifications.title")}</h1>

        {/* Email row */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {hasEmail && !editingEmail ? (
            <>
              <p className="text-sm text-foreground/50">{data.email}</p>
              <button
                onClick={() => {
                  setEmailDraft(data.email ?? "");
                  setEditingEmail(true);
                }}
                className="text-xs text-blue-500 hover:underline"
              >
                {t("notifications.changeEmail")}
              </button>
            </>
          ) : editingEmail || !hasEmail ? (
            <>
              <input
                type="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEmail();
                  if (e.key === "Escape" && hasEmail) setEditingEmail(false);
                }}
                autoFocus={editingEmail}
                disabled={emailSaving}
                placeholder={hasEmail ? data.email ?? "" : t("notifications.emailPlaceholder")}
                className="min-w-0 flex-1 rounded-lg border border-foreground/20 bg-transparent px-3 py-1.5 text-sm"
              />
              <button
                onClick={saveEmail}
                disabled={emailSaving}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {emailSaving ? "..." : t("notifications.saveEmail")}
              </button>
              {hasEmail && (
                <button
                  onClick={() => {
                    setEditingEmail(false);
                    setEmailError(null);
                  }}
                  disabled={emailSaving}
                  className="text-xs text-foreground/50 hover:text-foreground/70"
                >
                  &times;
                </button>
              )}
            </>
          ) : null}
        </div>
        {!hasEmail && (
          <p className="mt-1 text-xs text-foreground/50">{t("notifications.addEmail")}</p>
        )}
        {emailError && (
          <p className="mt-1 text-xs text-red-500">{emailError}</p>
        )}

        {/* 1. Channel toggles grouped at top */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("notifications.channels")}</h2>
          <div className="mt-3 space-y-3">
            <ToggleRow
              label={t("notifications.emailNotifications")}
              checked={prefs.emailEnabled && hasEmail}
              disabled={!hasEmail}
              onChange={(v) => togglePref("emailEnabled", v)}
              hint={!hasEmail ? t("notifications.emailDisabledHint") : undefined}
            />
            {isNative && (
              <ToggleRow
                label={t("notifications.pushNotifications")}
                checked={prefs.pushEnabled}
                onChange={(v) => togglePref("pushEnabled", v)}
              />
            )}
          </div>
        </section>

        {/* 2. Alert behavior */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("notifications.alertSettings")}</h2>
          <div className="mt-3 space-y-4">
            <div>
              <label className="text-sm font-medium">{t("notifications.advanceNotice")}</label>
              <select
                value={prefs.leadTimeDays}
                onChange={(e) => togglePref("leadTimeDays", Number(e.target.value))}
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
                onChange={(e) => togglePref("weekendOnly", e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <span className="text-sm">{t("notifications.weekendOnly")}</span>
            </label>
          </div>
        </section>

        {/* 3. Notification types */}
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("notifications.notificationTypes")}</h2>
            <button
              type="button"
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
          <p className="mt-1 text-xs text-foreground/50">{t("notifications.notificationTypesHint")}</p>

          <div className="mt-3 space-y-2">
            {ALL_ALERT_TYPES.map((type) => {
              const key = ALERT_TYPE_I18N_KEY[type];
              return (
                <ToggleRow
                  key={type}
                  label={t(`notifications.alertTypes.${key}.label`)}
                  description={t(`notifications.alertTypes.${key}.description`)}
                  checked={prefs.enabledAlertTypes.includes(type)}
                  onChange={() => toggleAlertType(type)}
                />
              );
            })}
          </div>
        </section>

        {/* Save + status */}
        <div className="mt-8 flex items-center gap-3">
          <button
            onClick={savePreferences}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? t("notifications.saving") : t("notifications.savePreferences")}
          </button>
          {saveStatus === "saved" && (
            <span className="text-sm text-green-600">{t("notifications.saved")} ✓</span>
          )}
          {saveStatus === "error" && (
            <span className="text-sm text-red-500">{t("notifications.saveFailed")}</span>
          )}
        </div>

        {/* Unsubscribe */}
        {subscriberToken && (
          <section className="mt-10 border-t border-foreground/10 pt-6">
            <button
              onClick={async () => {
                if (!confirm(t("notifications.unsubscribeConfirm"))) return;
                await fetch(`/api/notifications/unsubscribe?token=${subscriberToken}`, {
                  method: "DELETE",
                });
                window.location.href = "/";
              }}
              className="text-sm text-red-500 hover:underline"
            >
              {t("notifications.unsubscribeAll")}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local toggle component
// ---------------------------------------------------------------------------

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  hint,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className={disabled ? "opacity-60" : ""}>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded"
        />
        <span className="flex-1">
          <span className="block text-sm font-medium">{label}</span>
          {description && (
            <span className="block text-xs text-foreground/50">{description}</span>
          )}
        </span>
      </label>
      {hint && <p className="ml-7 mt-1 text-xs text-foreground/50">{hint}</p>}
    </div>
  );
}
