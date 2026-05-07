"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export interface LoginResult {
  ok: boolean;
  error?: string;
  redirectTo?: string;
}

export async function loginAction(
  _prev: LoginResult | null,
  formData: FormData,
): Promise<LoginResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/admin/users");

  if (!email || !password) {
    return { ok: false, error: "Email and password are required" };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    return { ok: true, redirectTo: sanitizeCallback(callbackUrl) };
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, error: "Invalid email or password" };
    }
    throw err;
  }
}

/**
 * Only allow same-origin paths. Anything else falls back to /admin/users.
 */
function sanitizeCallback(target: string): string {
  if (!target.startsWith("/") || target.startsWith("//")) {
    return "/admin/users";
  }
  return target;
}
