"use client";

import { useSession } from "next-auth/react";

/**
 * Returns true while the current visitor is signed in as an admin. Used by
 * client components on the public site to conditionally show admin-only UI
 * affordances (refresh buttons, edit panels, etc).
 *
 * The actual access decision happens server-side in middleware and in the
 * /admin layout — this hook only controls UI visibility, never security.
 */
export function useAdmin(): boolean {
  const { status, data } = useSession();
  return status === "authenticated" && !!data?.user?.id;
}
