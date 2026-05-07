import { auth } from "@/auth";

export interface AdminSession {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
}

/**
 * Returns the active admin session, or `null` if the request is not
 * authenticated. Used inside `/api/admin/*` route handlers where we want a
 * JSON 401 response rather than the redirect that the middleware emits for
 * page navigations.
 *
 *   const admin = await getAdminSession();
 *   if (!admin) return unauthorized();
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    role: session.user.role ?? "admin",
  };
}

export function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Convenience wrapper. Returns either the admin session, or a 401 Response
 * that the route handler can return directly.
 *
 *   const result = await requireAdmin();
 *   if (result instanceof Response) return result;
 *   const admin = result;
 */
export async function requireAdmin(): Promise<AdminSession | Response> {
  const admin = await getAdminSession();
  if (!admin) return unauthorized();
  return admin;
}
