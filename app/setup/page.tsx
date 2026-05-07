import { redirect } from "next/navigation";

import { countAdmins } from "@/lib/db/queries/admin-users";
import SetupForm from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if ((await countAdmins()) > 0) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold tracking-tight">Welcome to FlowCast</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Create the first admin account. Once this is done, the setup page is
          permanently disabled — additional admins can only be added from the
          admin panel.
        </p>
        <SetupForm />
      </div>
    </main>
  );
}
