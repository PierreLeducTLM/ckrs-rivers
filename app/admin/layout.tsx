import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-foreground/10 bg-foreground/[0.02]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin/users" className="font-semibold tracking-tight">
              FlowCast Admin
            </Link>
            <span className="text-foreground/20">|</span>
            <Link href="/admin/users" className="text-foreground/60 hover:text-foreground">
              Users
            </Link>
            <Link href="/admin/feature-flags" className="text-foreground/60 hover:text-foreground">
              Flags
            </Link>
            <Link href="/admin/flow-management" className="text-foreground/60 hover:text-foreground">
              Flows
            </Link>
            <Link href="/admin/notifications" className="text-foreground/60 hover:text-foreground">
              Notifications
            </Link>
            <Link href="/admin/subscribers" className="text-foreground/60 hover:text-foreground">
              Subscribers
            </Link>
          </nav>
          <div className="flex items-center gap-3 text-xs text-foreground/60">
            <span className="hidden sm:inline">
              {session.user.email ?? session.user.name ?? "admin"}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md border border-foreground/15 px-2.5 py-1 transition-colors hover:bg-foreground/5"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
