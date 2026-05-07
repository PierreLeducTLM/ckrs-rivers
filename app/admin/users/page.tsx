import { auth } from "@/auth";
import { listAdmins } from "@/lib/db/queries/admin-users";

import AdminUsersClient from "./users-client";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const [session, admins] = await Promise.all([auth(), listAdmins()]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight">Admins</h1>
      <p className="mt-1 text-sm text-foreground/50">
        Operators with access to /admin. Add, deactivate, or reset passwords below.
      </p>

      <AdminUsersClient
        admins={admins}
        currentUserId={session?.user?.id ?? null}
      />
    </main>
  );
}
