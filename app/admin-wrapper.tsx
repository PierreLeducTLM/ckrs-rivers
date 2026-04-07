"use client";

import { useAdmin } from "./use-admin";
import AddStation from "./add-station";

export function AdminAddStation() {
  const isAdmin = useAdmin();
  if (!isAdmin) return null;
  return <AddStation />;
}

export function AdminBadge() {
  const isAdmin = useAdmin();
  if (!isAdmin) return null;
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
      Admin
    </span>
  );
}
