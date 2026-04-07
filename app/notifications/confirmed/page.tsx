import Link from "next/link";

/**
 * /notifications/confirmed?token=xxx
 *
 * Landing page after email confirmation.
 */
export default async function ConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <svg
            className="h-8 w-8 text-green-600 dark:text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold">You&apos;re subscribed!</h1>
        <p className="mt-3 text-foreground/60">
          You&apos;ll receive email notifications when river conditions change.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/"
            className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700"
          >
            Back to Rivers
          </Link>
          {token && (
            <Link
              href={`/notifications?token=${token}`}
              className="rounded-lg bg-foreground/10 px-6 py-3 text-sm font-medium hover:bg-foreground/15"
            >
              Manage Preferences
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
