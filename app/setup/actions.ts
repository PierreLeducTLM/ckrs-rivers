"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { createFirstAdmin } from "@/lib/db/queries/admin-users";

export interface SetupResult {
  ok: boolean;
  error?: string;
  redirectTo?: string;
}

export async function setupAction(
  _prev: SetupResult | null,
  formData: FormData,
): Promise<SetupResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address" };
  }

  const pwError = validatePasswordStrength(password);
  if (pwError) return { ok: false, error: pwError };

  if (password !== confirm) {
    return { ok: false, error: "Passwords do not match" };
  }

  const passwordHash = await hashPassword(password);
  const admin = await createFirstAdmin({ email, passwordHash, name });

  if (!admin) {
    return {
      ok: false,
      error: "Setup is already complete. Sign in instead.",
    };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
  } catch (err) {
    // Should never happen — we just inserted this account, so credentials are
    // valid. Surface a non-fatal message so the user can still navigate to
    // /login manually.
    if (err instanceof AuthError) {
      return {
        ok: false,
        error: "Account created, but auto sign-in failed. Please sign in.",
      };
    }
    throw err;
  }

  return { ok: true, redirectTo: "/admin/users" };
}
