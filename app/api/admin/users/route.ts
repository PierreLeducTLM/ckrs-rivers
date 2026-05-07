import { NextRequest } from "next/server";
import { z } from "zod";

import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  createAdmin,
  getAdminByEmail,
  listAdmins,
} from "@/lib/db/queries/admin-users";

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).optional().nullable(),
  password: z.string(),
});

export async function GET() {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  const admins = await listAdmins();
  return Response.json({ admins });
}

export async function POST(request: NextRequest) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const pwError = validatePasswordStrength(parsed.data.password);
  if (pwError) return Response.json({ error: pwError }, { status: 400 });

  const email = parsed.data.email.trim().toLowerCase();
  const existing = await getAdminByEmail(email);
  if (existing) {
    return Response.json(
      { error: "An admin with that email already exists" },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const created = await createAdmin({
    email,
    passwordHash,
    name: parsed.data.name ?? null,
    createdBy: result.id,
  });

  return Response.json({ admin: created }, { status: 201 });
}
