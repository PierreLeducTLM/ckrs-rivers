"use client";

import { useState, useEffect, useCallback } from "react";
import { setSubToken, getSubToken } from "../subscribe-button";
import { useTranslation } from "@/lib/i18n/provider";
import { USER_FACING_ALERT_TYPES, type AlertType } from "@/lib/domain/notification";
import { initPushNotifications, getPushToken } from "@/lib/capacitor/push";

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
  enabledAlertTypes: [...USER_FACING_ALERT_TYPES],
};

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

/**
 * Inline notification-preferences UI for the unified Settings screen.
 *
 * Self-bootstraps: reads sub token from URL `?token=`, falls back to
 * localStorage (`getSubToken`), and resolves the native push token via
 * Capacitor when available. If neither is found, renders a small
 * "not subscribed yet" hint so the rest of the Settings page stays usable.
 */
export default function NotificationPreferences() {
  const { t } = useTranslation();

  const [subscriberToken, setSubscriberTokenState] = useState<string | null>(null);
  const [pushToken, setPushTokenState] = useState<string | null>(null);
  const [data, setData] = useState<ManageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasAnyToken, setHasAnyToken] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const urlSub = params.get("token");
      const urlPush = params.get("pushToken");

      // Token resolution order: URL param > localStorage / native push
      let sub = urlSub ?? getSubToken();
      let push = urlPush ?? getPushToken();

      // On native, attempt push registration if we still don't have one.
      if (!push) {
        try {
          push = await initPushNotifications();
        } catch {
          push = null;
        }
      }

      if (!sub && !push) {
        if (cancelled) return;
        setHasAnyToken(false);
        setLoading(false);
        return;
      }

      setHasAnyToken(true);
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
        if (d.subscriberToken && !sub) {
          setSubscriberTokenState(d.subscriberToken);
          setSubToken(d.subscriberToken);
          sub = d.subscriberToken;
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
      // Brief "Saved" flash; no auto-navigation since we live on /settings now.
      setTimeout(() => setSaveStatus("idle"), 1800);
    } catch {
      setSaveStatus("error");
      setSaving(false);
    }
  }, [prefs, subscriberToken, pushToken]);

  const saveEmail = useCallback(async () => {
    const draft = emailDraft.trim().toLowerCase();
    if (!draft || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft)) {
      setEmailError(t("notifications.saveFailed"));
      return;
    }

    setEmailSaving(true);
    setEmailError(null);

    try {
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
    setPrefs((p) => ({ ...p, enabledAlertTypes: [...USER_FACING_ALERT_TYPES] }));

  const deselectAllAlertTypes = () =>
    setPrefs((p) => ({ ...p, enabledAlertTypes: [] }));

  // Loading state — keep it small so it doesn't dominate the settings page.
  if (loading) {
    return <div className="h-12 animate-pulse rounded-xl bg-foreground/5" />;
  }

  // Not subscribed — friendly hint instead of blocking the page.
  if (!hasAnyToken) {
    return (
      <div className="rounded-xl border border-foreground/10 bg-background p-5 text-sm text-foreground/70">
        <p>{t("notifications.notSubscribedHint")}</p>
      </div>
    );
  }

  // Token present but the manage endpoint failed (e.g. expired/invalid).
  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/50 p-5 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
        <p>{error ?? t("notifications.somethingWrong")}</p>
      </div>
    );
  }

  const hasEmail = !!data.email;
  const isNative = !!pushToken;
  // "Select all" reflects the user-facing list only — old saved prefs that
  // still carry now-disabled types shouldn't make this checkbox lie.
  const enabledUserFacing = new Set(prefs.enabledAlertTypes);
  const allUserFacingEnabled = USER_FACING_ALERT_TYPES.every((type) => enabledUserFacing.has(type));

  return (
    <div>
      {/* Email row */}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {hasEmail && !editingEmail ? (
          <>
            <p className="text-sm text-foreground/60">{data.email}</p>
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
      {emailError && <p className="mt-1 text-xs text-red-500">{emailError}</p>}

      {/* Channels */}
      <section className="mt-6">
        <h3 className="text-sm font-semibold">{t("notifications.channels")}</h3>
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

      {/* Alert behavior */}
      <section className="mt-6">
        <h3 className="text-sm font-semibold">{t("notifications.alertSettings")}</h3>
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

      {/* Notification types */}
      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t("notifications.notificationTypes")}</h3>
          <button
            type="button"
            onClick={
              allUserFacingEnabled ? deselectAllAlertTypes : selectAllAlertTypes
            }
            className="text-xs text-blue-500 hover:underline"
          >
            {allUserFacingEnabled
              ? t("notifications.deselectAll")
              : t("notifications.selectAll")}
          </button>
        </div>
        <p className="mt-1 text-xs text-foreground/50">
          {t("notifications.notificationTypesHint")}
        </p>

        <div className="mt-3 space-y-2">
          {USER_FACING_ALERT_TYPES.map((type) => {
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
      <div className="mt-6 flex items-center gap-3">
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
        <div className="mt-8 border-t border-foreground/10 pt-5">
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
        </div>
      )}
    </div>
  );
}

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
