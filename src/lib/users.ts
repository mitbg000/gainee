import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Role } from "@/db/schema";
import { AI_TASKS } from "@/lib/ai/tasks";
import { actorId } from "@/lib/actor";

export type User = typeof schema.users.$inferSelect;

/** Switchable features: the AI tasks plus AI pictures. */
export const FEATURES = [...AI_TASKS, "images"] as const;
export type Feature = (typeof FEATURES)[number];

export const RANK: Record<Role, number> = { student: 0, editor: 1, admin: 2 };

/** A role's defaults: learners do not read IELTS books in (that is the editors' job). */
const roleAllows = (role: Role, f: Feature) => role !== "student" || f !== "ielts_import";

export function canUse(u: Pick<User, "role" | "features">, f: Feature) {
  return u.features?.[f] ?? roleAllows(u.role, f);
}

export const getUser = async (id: number) => (await getDb().select().from(schema.users).where(eq(schema.users.id, id)))[0];

/** The logged-in user of this request (or worker job), or null: locked accounts and ended sessions count as logged out. */
export const currentUser = cache(async (): Promise<User | null> => {
  const id = await actorId();
  if (!id) return null;
  const u = await getUser(id);
  if (!u || u.disabled) return null;
  try {
    const { headers } = await import("next/headers");
    const sv = (await headers()).get("x-user-sv");
    if (sv !== null && Number(sv) !== u.sessionVersion) return null; // password changed / logged out everywhere
  } catch {}
  return u;
});

export const isEditor = async () => !!(await requireRole("editor"));

/** For API routes: the user if their role is at least `min`, else null (answer 403). */
export async function requireRole(min: Role) {
  const u = await currentUser();
  return u && RANK[u.role] >= RANK[min] ? u : null;
}
