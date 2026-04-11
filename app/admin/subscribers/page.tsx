"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAdmin } from "@/app/use-admin";

interface Subscription {
  stationId: string;
  stationName: string;
  active: boolean;
}

interface Subscriber {
  id: string;
  email: string;
  confirmed: boolean;
  created_at: string;
  subscriptions: Subscription[];
}

export default function AdminSubscribersPage() {
  const isAdmin = useAdmin();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/admin/subscribers")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load subscribers");
        return res.json();
      })
      .then((data) => setSubscribers(data.subscribers))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-foreground/50">Admin access required</p>
      </div>
    );
  }

  const totalActive = subscribers.filter((s) =>
    s.subscriptions.some((sub) => sub.active),
  ).length;

  // Aggregate: how many subscribers per station
  const stationCounts = new Map<string, { name: string; count: number }>();
  for (const sub of subscribers) {
    for (const sc of sub.subscriptions) {
      if (!sc.active) continue;
      const entry = stationCounts.get(sc.stationId);
      if (entry) {
        entry.count++;
      } else {
        stationCounts.set(sc.stationId, { name: sc.stationName, count: 1 });
      }
    }
  }
  const stationList = [...stationCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count);

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

        <h1 className="text-2xl font-bold tracking-tight">Subscribers</h1>
        <p className="mt-1 text-sm text-foreground/50">
          {subscribers.length} subscriber{subscribers.length !== 1 && "s"} &middot;{" "}
          {totalActive} with active notifications
        </p>

        {loading && (
          <p className="mt-8 text-center text-foreground/40">Loading...</p>
        )}
        {error && (
          <p className="mt-8 text-center text-red-500">{error}</p>
        )}

        {!loading && !error && (
          <>
            {/* Station summary */}
            {stationList.length > 0 && (
              <div className="mt-6 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4">
                <h2 className="mb-3 text-sm font-semibold text-foreground/70">
                  Notifications per river
                </h2>
                <div className="flex flex-wrap gap-2">
                  {stationList.map(([id, { name, count }]) => (
                    <Link
                      key={id}
                      href={`/rivers/${id}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-background px-3 py-1 text-xs font-medium text-foreground/70 transition-colors hover:border-foreground/25 hover:text-foreground"
                    >
                      {name}
                      <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                        {count}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Subscriber table */}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-foreground/10 text-xs font-semibold uppercase tracking-wider text-foreground/50">
                    <th className="pb-2 pr-4">Email</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Rivers</th>
                    <th className="pb-2">Since</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-foreground/5">
                  {subscribers.map((sub) => {
                    const active = sub.subscriptions.filter((s) => s.active);
                    return (
                      <tr key={sub.id} className="group">
                        <td className="py-3 pr-4 font-medium">
                          {sub.email}
                        </td>
                        <td className="py-3 pr-4">
                          {sub.confirmed ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Confirmed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {active.length === 0 ? (
                            <span className="text-foreground/30">None</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {active.map((s) => (
                                <Link
                                  key={s.stationId}
                                  href={`/rivers/${s.stationId}`}
                                  className="rounded-md bg-foreground/5 px-2 py-0.5 text-xs text-foreground/70 hover:bg-foreground/10 hover:text-foreground"
                                >
                                  {s.stationName}
                                </Link>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-3 whitespace-nowrap text-foreground/50">
                          {new Date(sub.created_at).toLocaleDateString("en-CA", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {subscribers.length === 0 && (
                <p className="py-12 text-center text-foreground/40">No subscribers yet</p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
