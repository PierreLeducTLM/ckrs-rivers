import { redirect } from "next/navigation";

/**
 * Legacy email links arrive at /notifications?token=... — keep working by
 * redirecting to the unified Settings screen, which renders the same
 * notification-preferences UI inline. Query string is preserved so the
 * client component can pick up the sub/push tokens.
 */
export default async function NotificationsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v) && v.length > 0) qs.set(k, v[0]);
  }
  const target = qs.toString() ? `/settings?${qs.toString()}` : "/settings";
  redirect(target);
}
