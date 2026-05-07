"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { setupAction, type SetupResult } from "./actions";

export default function SetupForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<SetupResult | null, FormData>(
    setupAction,
    null,
  );

  useEffect(() => {
    if (state?.ok && state.redirectTo) {
      router.replace(state.redirectTo);
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <Field id="email" label="Email" type="email" autoComplete="username" />
      <Field id="name" label="Name (optional)" type="text" required={false} />
      <Field
        id="password"
        label="Password (min 10 chars)"
        type="password"
        autoComplete="new-password"
      />
      <Field
        id="confirm"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
      />

      {state?.error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Creating..." : "Create admin & sign in"}
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  type,
  autoComplete,
  required = true,
}: {
  id: string;
  label: string;
  type: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-medium text-foreground/60"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        required={required}
        className="w-full rounded-lg border border-foreground/15 bg-transparent px-3 py-2 text-sm placeholder:text-foreground/30 focus:border-brand focus:outline-none"
      />
    </div>
  );
}
