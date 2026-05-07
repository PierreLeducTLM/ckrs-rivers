import { NextRequest } from "next/server";
import { z } from "zod";

import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  countActiveAdmins,
  getAdminById,
  setAdminActive,
  updateAdminName,
  updateAdminPassword,
} from "@/lib/db/queries/admin-users";

const updateSchema = z
  .object({
    name: z.string().trim().min(1).nullable().optional(),
    isActive: z.boolean().optional(),
    password: z.string().optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined || v.isActive !== undefined || v.password !== undefined,
    { message: "Provide at least one field to update" },
  );

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  const { id } = await params;
  const target = await getAdminById(id);
  if (!target) {
    return Response.json({ error: "Admin not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  // Password update
  if (parsed.data.password !== undefined) {
    const pwError = validatePasswordStrength(parsed.data.password);
    if (pwError) return Response.json({ error: pwError }, { status: 400 });
    await updateAdminPassword(id, await hashPassword(parsed.data.password));
  }

  // Name update
  if (parsed.data.name !== undefined) {
    await updateAdminName(id, parsed.data.name);
  }

  // Active toggle — guard against locking yourself out and against losing the
  // last active admin.
  if (parsed.data.isActive !== undefined) {
    if (!parsed.data.isActive) {
      if (id === result.id) {
        return Response.json(
          { error: "You can't deactivate your own account" },
          { status: 400 },
        );
      }
      if (target.is_active && (await countActiveAdmins()) <= 1) {
        return Response.json(
          { error: "Can't deactivate the last active admin" },
          { status: 400 },
        );
      }
    }
    await setAdminActive(id, parsed.data.isActive);
  }

  const updated = await getAdminById(id);
  return Response.json({ admin: updated });
}
