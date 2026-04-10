"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAdmin } from "@/app/use-admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatusData {
  testStation: { id: string; name: string; status: string } | null;
  subscribers: Array<{ id: string; email: string; active: boolean; subscription_id: string }>;
  recentLogs: Array<{
    id: string;
    alert_type: string;
    priority: string;
    subject: string;
    sent_at: string | null;
    delivered: boolean;
    email: string;
  }>;
  alertStates: Array<{ alert_type: string; state: string; last_triggered: string | null }>;
  currentSnapshot: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Notification catalog
// ---------------------------------------------------------------------------

interface NotificationDef {
  type: string;
  emoji: string;
  label: string;
  priority: "critical" | "high" | "normal" | "low";
  cooldown: string;
  trigger: string;
  condition: string;
  canSchedule: boolean;
}

const NOTIFICATIONS: NotificationDef[] = [
  {
    type: "its-on",
    emoji: "\uD83D\uDFE2",
    label: "It's On!",
    priority: "critical",
    cooldown: "6h",
    trigger: "evaluate-alerts",
    condition: "Station enters runnable range (was too-low or too-high, now between paddling min and max)",
    canSchedule: true,
  },
  {
    type: "safety-warning",
    emoji: "\uD83D\uDD34",
    label: "Safety Warning",
    priority: "critical",
    cooldown: "6h",
    trigger: "evaluate-alerts",
    condition: "Flow exceeds paddling max threshold. Station was NOT too-high before, now is too-high.",
    canSchedule: true,
  },
  {
    type: "dropping-out",
    emoji: "\uD83D\uDCC9",
    label: "Dropping Out",
    priority: "normal",
    cooldown: "12h",
    trigger: "evaluate-alerts",
    condition: "Currently runnable but forecast shows flow will exit range in 12-24 hours",
    canSchedule: true,
  },
  {
    type: "runnable-in-n-days",
    emoji: "\uD83D\uDCC5",
    label: "Runnable in N Days",
    priority: "normal",
    cooldown: "24h",
    trigger: "evaluate-alerts",
    condition: "Not currently runnable, but forecast predicts entry into runnable range within subscriber's lead time (1-5 days)",
    canSchedule: true,
  },
  {
    type: "rain-bump",
    emoji: "\uD83C\uDF27\uFE0F",
    label: "Rain Bump",
    priority: "high",
    cooldown: "24h",
    trigger: "evaluate-alerts",
    condition: "More than 15mm of precipitation expected in the next 48 hours (and previous evaluation was \u226415mm)",
    canSchedule: true,
  },
  {
    type: "confidence-upgraded",
    emoji: "\u2705",
    label: "Confidence Upgraded",
    priority: "high",
    cooldown: "24h",
    trigger: "evaluate-alerts",
    condition: "Forecast confidence level improved from medium to high (based on forecast range width narrowing below 30%)",
    canSchedule: true,
  },
  {
    type: "rising-into-range",
    emoji: "\uD83D\uDCC8",
    label: "Rising Into Range",
    priority: "normal",
    cooldown: "12h",
    trigger: "evaluate-alerts",
    condition: "Flow is too-low but trending upward (>5% rise in last 6h) and current flow is above 80% of paddling minimum",
    canSchedule: true,
  },
  {
    type: "weekend-forecast",
    emoji: "\uD83D\uDCC6",
    label: "Weekend Forecast",
    priority: "normal",
    cooldown: "7d",
    trigger: "send-digest (cron: Wed/Thu/Fri 6 PM ET)",
    condition: "Weekly digest email sent every Wednesday, Thursday and Friday at 6 PM Eastern. Contains all subscribed rivers with current flow and 3-day forecast.",
    canSchedule: false,
  },
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  normal: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  low: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[priority] ?? ""}`}>
      {priority}
    </span>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"}`} />
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminNotificationsPage() {
  const isAdmin = useAdmin();
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [setupDone, setSetupDone] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [expandedDoc, setExpandedDoc] = useState(false);

  const fetchStatusRef = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifications");
      if (res.ok) {
        const data = (await res.json()) as StatusData;
        setStatus(data);
        setSetupDone(!!data.testStation);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/notifications");
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as StatusData;
          setStatus(data);
          setSetupDone(!!data.testStation);
          // Only pre-fill email on initial load
          if (data.subscribers.length > 0) {
            setEmail(data.subscribers[0].email);
          }
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 6000);
  };

  const handleSetup = async () => {
    if (!email) return;
    setActionLoading("setup");
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup", email }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage("success", "Test river created and subscription active!");
        setSetupDone(true);
        fetchStatusRef();
      } else {
        showMessage("error", data.error ?? "Setup failed");
      }
    } catch {
      showMessage("error", "Network error");
    }
    setActionLoading(null);
  };

  const handleSchedule = async (alertType: string) => {
    setActionLoading(alertType);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "schedule", alertType }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage("success", `Scenario "${alertType}" injected and evaluate-alerts triggered!${data.triggerResult?.id ? ` Run: ${data.triggerResult.id}` : ""}`);
        setTimeout(fetchStatusRef, 3000);
      } else if (data.directOnly) {
        showMessage("error", data.error);
      } else {
        showMessage("error", data.error ?? "Schedule failed");
      }
    } catch {
      showMessage("error", "Network error");
    }
    setActionLoading(null);
  };

  const handleDirectSend = async (alertType: string) => {
    if (!email) {
      showMessage("error", "Set up email first");
      return;
    }
    setActionLoading(`direct-${alertType}`);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "direct-send", alertType, email }),
      });
      const data = await res.json();
      if (data.success) {
        showMessage("success", `"${alertType}" email sent directly to ${email}`);
        setTimeout(fetchStatusRef, 2000);
      } else {
        showMessage("error", "Failed to send email. Check RESEND_API_KEY.");
      }
    } catch {
      showMessage("error", "Network error");
    }
    setActionLoading(null);
  };

  const handleResetCooldowns = async () => {
    setActionLoading("reset");
    try {
      await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset-cooldowns" }),
      });
      showMessage("success", "All cooldowns cleared");
      fetchStatusRef();
    } catch {
      showMessage("error", "Failed to reset cooldowns");
    }
    setActionLoading(null);
  };

  // ---------- Access control ----------
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Admin Access Required</h1>
          <p className="mt-2 text-foreground/60">
            Add <code className="rounded bg-foreground/5 px-1.5 py-0.5 text-sm">?admin</code> to any page URL to enable admin mode.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm text-brand underline">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-foreground/50">Loading...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-foreground/50 hover:text-foreground/70">
            &larr; Back to app
          </Link>
          <h1 className="mt-1 text-2xl font-bold">Notification Testing</h1>
          <p className="mt-1 text-sm text-foreground/60">
            Schedule test notifications using a dedicated test river with controlled data.
          </p>
        </div>
        <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
          Admin
        </span>
      </div>

      {/* Toast */}
      {message && (
        <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
          message.type === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
            : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
        }`}>
          {message.text}
        </div>
      )}

      {/* ================================================================ */}
      {/* Section 1: Notification Reference */}
      {/* ================================================================ */}
      <section className="mb-10">
        <button
          onClick={() => setExpandedDoc(!expandedDoc)}
          className="flex w-full items-center justify-between rounded-xl border border-foreground/10 bg-foreground/[0.02] px-6 py-4 text-left transition-colors hover:bg-foreground/[0.04]"
        >
          <div>
            <h2 className="text-lg font-semibold">Notification Reference</h2>
            <p className="text-sm text-foreground/50">
              All 15 notification types with trigger conditions, priorities, and cooldowns
            </p>
          </div>
          <span className="text-foreground/40">{expandedDoc ? "\u25B2" : "\u25BC"}</span>
        </button>

        {expandedDoc && (
          <div className="mt-2 overflow-hidden rounded-xl border border-foreground/10">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-foreground/10 bg-foreground/[0.03]">
                    <th className="px-4 py-3 text-left font-medium text-foreground/70">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-foreground/70">Priority</th>
                    <th className="px-4 py-3 text-left font-medium text-foreground/70">Cooldown</th>
                    <th className="px-4 py-3 text-left font-medium text-foreground/70">Trigger</th>
                    <th className="px-4 py-3 text-left font-medium text-foreground/70">Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {NOTIFICATIONS.map((n) => (
                    <tr key={n.type} className="border-b border-foreground/5 last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 font-medium">
                        <span className="mr-1.5">{n.emoji}</span>
                        {n.label}
                        <div className="mt-0.5 font-mono text-xs text-foreground/40">{n.type}</div>
                      </td>
                      <td className="px-4 py-3"><PriorityBadge priority={n.priority} /></td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{n.cooldown}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-foreground/60">{n.trigger}</td>
                      <td className="max-w-sm px-4 py-3 text-xs leading-relaxed text-foreground/70">{n.condition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Additional documentation */}
            <div className="border-t border-foreground/10 bg-foreground/[0.02] px-6 py-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground/70">How the notification pipeline works</h3>
              <div className="space-y-2 text-xs leading-relaxed text-foreground/60">
                <p>
                  <strong>1. Data Refresh</strong> (every 15 min via <code className="rounded bg-foreground/5 px-1">refresh-all-stations</code>):
                  Fetches real-time flow from CEHQ, official forecast, and weather from Open-Meteo.
                  Stores results in <code className="rounded bg-foreground/5 px-1">forecast_cache</code>.
                </p>
                <p>
                  <strong>2. Alert Evaluation</strong> (chained from refresh via <code className="rounded bg-foreground/5 px-1">evaluate-alerts</code>):
                  Computes a <em>StationSnapshot</em> from forecast_cache for each station.
                  Compares current snapshot against the previous one stored in <code className="rounded bg-foreground/5 px-1">alert_snapshots</code>.
                  Detects state changes (differential analysis) and generates <em>AlertCandidates</em>.
                </p>
                <p>
                  <strong>3. Filtering</strong>:
                  Each candidate is checked against subscriber preferences: cooldown period, quiet hours (22:00-07:00 ET for non-critical),
                  weekend-only mode (Fri-Sun), confidence threshold (high-only vs medium+), lead time (1-5 days for runnable-in-n-days),
                  and digest mode (normal/low go to digest, critical/high go immediately).
                </p>
                <p>
                  <strong>4. Delivery</strong>:
                  Emails sent via Resend API. Logged in <code className="rounded bg-foreground/5 px-1">notification_log</code>.
                  Alert state updated in <code className="rounded bg-foreground/5 px-1">alert_state</code> to track cooldowns.
                </p>
                <p>
                  <strong>5. Digest</strong> (Wed/Thu 6 PM ET via <code className="rounded bg-foreground/5 px-1">send-digest</code>):
                  Sends a summary email with all subscribed rivers, their current flow, and 3-day forecast.
                </p>
              </div>

              <h3 className="mb-2 mt-4 text-sm font-semibold text-foreground/70">Snapshot fields used for detection</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-foreground/60">
                <div><code className="text-foreground/80">currentFlow</code> &mdash; Latest daily average flow (m&sup3;/s)</div>
                <div><code className="text-foreground/80">paddlingStatus</code> &mdash; too-low / runnable / ideal / too-high</div>
                <div><code className="text-foreground/80">runnableWindowDays</code> &mdash; Consecutive forecast days in range</div>
                <div><code className="text-foreground/80">trendDirection</code> &mdash; rising / falling / stable (&plusmn;5% over 6h)</div>
                <div><code className="text-foreground/80">forecastEntersRange</code> &mdash; Will enter runnable range?</div>
                <div><code className="text-foreground/80">forecastExitsRange</code> &mdash; Will exit runnable range?</div>
                <div><code className="text-foreground/80">precipNext48h</code> &mdash; Total precipitation next 48h (mm)</div>
                <div><code className="text-foreground/80">confidenceLevel</code> &mdash; high / medium / low (from range width)</div>
              </div>

              <h3 className="mb-2 mt-4 text-sm font-semibold text-foreground/70">Test river thresholds</h3>
              <p className="text-xs text-foreground/60">
                Paddling min: <strong>10 m&sup3;/s</strong> &middot;
                Ideal: <strong>20 m&sup3;/s</strong> &middot;
                Max: <strong>35 m&sup3;/s</strong>
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ================================================================ */}
      {/* Section 2: Test River Setup */}
      {/* ================================================================ */}
      <section className="mb-10 rounded-xl border border-foreground/10 p-6">
        <h2 className="text-lg font-semibold">Test River Setup</h2>
        <p className="mt-1 text-sm text-foreground/50">
          Creates a dedicated test station (<code className="rounded bg-foreground/5 px-1 text-xs">TEST-000000</code>)
          excluded from real data refreshes. Your email will be auto-subscribed and confirmed.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <StatusDot ok={setupDone} />
          <span className="text-sm">
            {setupDone ? (
              <>
                Test river active
                {status?.subscribers?.[0] && (
                  <span className="ml-2 text-foreground/50">
                    &middot; Subscribed: <strong>{status.subscribers[0].email}</strong>
                  </span>
                )}
              </>
            ) : (
              "Not configured"
            )}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="test-email" className="mb-1 block text-xs font-medium text-foreground/60">
              Notification email
            </label>
            <input
              id="test-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-64 rounded-lg border border-foreground/15 bg-transparent px-3 py-2 text-sm placeholder:text-foreground/30 focus:border-brand focus:outline-none"
            />
          </div>
          <button
            onClick={handleSetup}
            disabled={!email || actionLoading === "setup"}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {actionLoading === "setup" ? "Setting up..." : setupDone ? "Update Setup" : "Create Test River"}
          </button>
          {setupDone && (
            <button
              onClick={handleResetCooldowns}
              disabled={actionLoading === "reset"}
              className="rounded-lg border border-foreground/15 px-4 py-2 text-sm text-foreground/70 transition-colors hover:bg-foreground/5 disabled:opacity-40"
            >
              {actionLoading === "reset" ? "Clearing..." : "Reset All Cooldowns"}
            </button>
          )}
        </div>
      </section>

      {/* ================================================================ */}
      {/* Section 3: Trigger Notifications */}
      {/* ================================================================ */}
      {setupDone && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold">Schedule Notifications</h2>
          <p className="mt-1 mb-4 text-sm text-foreground/50">
            Inject scenario data into the test river and trigger <code className="rounded bg-foreground/5 px-1 text-xs">evaluate-alerts</code>.
            The task will compute the snapshot, detect the alert, and send the email to your subscribed address.
          </p>

          <div className="space-y-2">
            {NOTIFICATIONS.map((n) => {
              const isScheduling = actionLoading === n.type;
              const isDirectSending = actionLoading === `direct-${n.type}`;
              const cooldownActive = status?.alertStates.find((s) => s.alert_type === n.type);

              return (
                <div
                  key={n.type}
                  className="flex items-center justify-between rounded-lg border border-foreground/10 px-4 py-3 transition-colors hover:bg-foreground/[0.02]"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span>{n.emoji}</span>
                      <span className="font-medium text-sm">{n.label}</span>
                      <PriorityBadge priority={n.priority} />
                      {cooldownActive?.last_triggered && (
                        <span className="text-xs text-orange-500">
                          In cooldown (last: {new Date(cooldownActive.last_triggered).toLocaleTimeString()})
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-foreground/50 max-w-xl">{n.condition}</p>
                  </div>

                  <div className="flex gap-2 ml-4 shrink-0">
                    {n.canSchedule ? (
                      <button
                        onClick={() => handleSchedule(n.type)}
                        disabled={!!actionLoading}
                        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isScheduling ? "Injecting..." : "Schedule & Trigger"}
                      </button>
                    ) : null}
                    <button
                      onClick={() => handleDirectSend(n.type)}
                      disabled={!!actionLoading}
                      className="rounded-lg border border-foreground/15 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isDirectSending ? "Sending..." : "Direct Send"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* Section 4: Recent Notification Log */}
      {/* ================================================================ */}
      {setupDone && status?.recentLogs && status.recentLogs.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Recent Notifications</h2>
            <button
              onClick={fetchStatusRef}
              className="rounded-lg border border-foreground/15 px-3 py-1.5 text-xs text-foreground/60 transition-colors hover:bg-foreground/5"
            >
              Refresh
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-foreground/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/10 bg-foreground/[0.03]">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground/60">Time</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground/60">Type</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground/60">Priority</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground/60">To</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground/60">Delivered</th>
                </tr>
              </thead>
              <tbody>
                {status.recentLogs.map((log) => (
                  <tr key={log.id} className="border-b border-foreground/5 last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-foreground/60">
                      {log.sent_at ? new Date(log.sent_at).toLocaleString() : "Not sent"}
                    </td>
                    <td className="px-4 py-2">
                      <span className="mr-1">
                        {NOTIFICATIONS.find((n) => n.type === log.alert_type)?.emoji ?? ""}
                      </span>
                      <span className="font-mono text-xs">{log.alert_type}</span>
                    </td>
                    <td className="px-4 py-2"><PriorityBadge priority={log.priority} /></td>
                    <td className="px-4 py-2 text-xs text-foreground/60">{log.email}</td>
                    <td className="px-4 py-2">
                      {log.delivered ? (
                        <span className="text-emerald-600 dark:text-emerald-400">Yes</span>
                      ) : (
                        <span className="text-red-500">No</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* Section 5: Current Snapshot (debug) */}
      {/* ================================================================ */}
      {setupDone && status?.currentSnapshot && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Current Snapshot (debug)</h2>
          <pre className="overflow-auto rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4 text-xs text-foreground/70">
            {JSON.stringify(status.currentSnapshot, null, 2)}
          </pre>
        </section>
      )}

      {/* ================================================================ */}
      {/* Section 6: Alert States (debug) */}
      {/* ================================================================ */}
      {setupDone && status?.alertStates && status.alertStates.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Active Cooldowns</h2>
          <div className="overflow-hidden rounded-xl border border-foreground/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/10 bg-foreground/[0.03]">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground/60">Alert Type</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground/60">State</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground/60">Last Triggered</th>
                </tr>
              </thead>
              <tbody>
                {status.alertStates.map((s) => (
                  <tr key={s.alert_type} className="border-b border-foreground/5 last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{s.alert_type}</td>
                    <td className="px-4 py-2 text-xs">{s.state}</td>
                    <td className="px-4 py-2 text-xs text-foreground/60">
                      {s.last_triggered ? new Date(s.last_triggered).toLocaleString() : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
