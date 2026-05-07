import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { countAdmins } from "@/lib/db/queries/admin-users";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/admin/users");
  }

  // Fresh deploys: send first visitor straight to the setup wizard.
  if ((await countAdmins()) === 0) {
    redirect("/setup");
  }

  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/admin/users";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-foreground/50">
          FlowCast admin panel.
        </p>
        <LoginForm callbackUrl={callbackUrl} />
      </div>
    </main>
  );
}
