"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { AdminUserRow } from "@/lib/db/queries/admin-users";

interface Props {
  admins: AdminUserRow[];
  currentUserId: string | null;
}

export default function AdminUsersClient({ admins, currentUserId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);

  const refresh = () => router.refresh();

  const submitCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const name = String(data.get("name") ?? "").trim() || null;
    const password = String(data.get("password") ?? "");

    if (!email || !password) {
      setError("Email and password are required");
      return;
    }

    startTransition(async () => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to create admin");
        return;
      }
      form.reset();
      refresh();
    });
  };

  const setActive = (id: string, isActive: boolean) => {
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to update admin");
        return;
      }
      refresh();
    });
  };

  const submitReset = (id: string, password: string) => {
    if (password.length < 10) {
      setError("New password must be at least 10 characters");
      return;
    }
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to reset password");
        return;
      }
      setResetTargetId(null);
      refresh();
    });
  };

  return (
    <>
      {/* Create form */}
      <section className="mt-6 rounded-xl border border-foreground/10 p-5">
        <h2 className="text-base font-semibold">Add admin</h2>
        <form
          onSubmit={submitCreate}
          className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <input
            name="email"
            type="email"
            required
            placeholder="email@example.com"
            className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2 text-sm placeholder:text-foreground/30 focus:border-brand focus:outline-none"
          />
          <input
            name="name"
            type="text"
            placeholder="Name (optional)"
            className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2 text-sm placeholder:text-foreground/30 focus:border-brand focus:outline-none"
          />
          <input
            name="password"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            placeholder="Password (min 10 chars)"
            className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2 text-sm placeholder:text-foreground/30 focus:border-brand focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Working..." : "Add admin"}
          </button>
        </form>
      </section>

      {error && (
        <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* List */}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-foreground/10 text-xs font-semibold uppercase tracking-wider text-foreground/50">
              <th className="pb-2 pr-4">Email</th>
              <th className="pb-2 pr-4">Name</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Created</th>
              <th className="pb-2 pr-4">Last login</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/5">
            {admins.map((a) => {
              const isSelf = a.id === currentUserId;
              return (
                <tr key={a.id} className="align-top">
                  <td className="py-3 pr-4 font-medium">
                    {a.email}
                    {isSelf && (
                      <span className="ml-2 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand">
                        you
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-foreground/70">
                    {a.name ?? <span className="text-foreground/30">—</span>}
                  </td>
                  <td className="py-3 pr-4">
                    {a.is_active ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/10 px-2 py-0.5 text-xs font-medium text-zinc-500">
                        Disabled
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap text-foreground/60">
                    {fmt(a.created_at)}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap text-foreground/60">
                    {a.last_login_at ? fmt(a.last_login_at) : <span className="text-foreground/30">never</span>}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setResetTargetId((id) => (id === a.id ? null : a.id))}
                        disabled={pending}
                        className="rounded-md border border-foreground/15 px-2 py-1 text-xs text-foreground/70 transition-colors hover:bg-foreground/5 disabled:opacity-50"
                      >
                        Reset password
                      </button>
                      {a.is_active ? (
                        <button
                          onClick={() => setActive(a.id, false)}
                          disabled={pending || isSelf}
                          title={isSelf ? "You can't deactivate yourself" : undefined}
                          className="rounded-md border border-red-500/30 px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => setActive(a.id, true)}
                          disabled={pending}
                          className="rounded-md border border-emerald-500/30 px-2 py-1 text-xs text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-40 dark:text-emerald-400"
                        >
                          Reactivate
                        </button>
                      )}
                    </div>

                    {resetTargetId === a.id && (
                      <PasswordResetRow
                        onCancel={() => setResetTargetId(null)}
                        onSubmit={(pw) => submitReset(a.id, pw)}
                        pending={pending}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PasswordResetRow({
  onCancel,
  onSubmit,
  pending,
}: {
  onCancel: () => void;
  onSubmit: (pw: string) => void;
  pending: boolean;
}) {
  const [pw, setPw] = useState("");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        autoComplete="new-password"
        placeholder="New password"
        className="rounded-md border border-foreground/15 bg-transparent px-2 py-1 text-xs placeholder:text-foreground/30 focus:border-brand focus:outline-none"
      />
      <button
        onClick={() => onSubmit(pw)}
        disabled={pending}
        className="rounded-md bg-brand px-2 py-1 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
      >
        Save
      </button>
      <button
        onClick={onCancel}
        disabled={pending}
        className="rounded-md border border-foreground/15 px-2 py-1 text-xs text-foreground/60 hover:bg-foreground/5 disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
