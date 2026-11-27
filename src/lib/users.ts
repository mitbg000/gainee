import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Role } from "@/db/schema";
import { AI_TASKS } from "@/lib/ai/tasks";
import { actorId } from "@/lib/actor";

export type User = typeof schema.users.$inferSelect;

/** Switchable features: the AI tasks, AI pictures, and adding one's own reading texts. */
export const FEATURES = [...AI_TASKS, "images", "add_documents"] as const;
export type Feature = (typeof FEATURES)[number];
export type Switches = Partial<Record<string, boolean>> | null;

export const RANK: Record<Role, number> = { student: 0, editor: 1, admin: 2 };

/** A role's defaults: learners do not read IELTS books in (that is the editors' job). */
const roleAllows = (role: Role, f: Feature) => role !== "student" || f !== "ielts_import";

/** The user's own switch, else their groups' (one group allowing it is enough), else the role's default. */
export function canUse(u: Pick<User, "role" | "features">, f: Feature, groups: Switches[] = []) {
  if (u.role === "admin") return true;
  const own = u.features?.[f];
  if (typeof own === "boolean") return own;
  const set = groups.map((g) => g?.[f]).filter((v): v is boolean => typeof v === "boolean");
  return set.length ? set.some(Boolean) : roleAllows(u.role, f);
}

export const getUser = async (id: number) => (await getDb().select().from(schema.users).where(eq(schema.users.id, id)))[0];

/** The switches of the groups a user is in. */
export async function groupSwitches(userId: number): Promise<Switches[]> {
  const rows = await getDb()
    .select({ f: schema.groups.features })
    .from(schema.userGroups)
    .innerJoin(schema.groups, eq(schema.groups.id, schema.userGroups.groupId))
    .where(eq(schema.userGroups.userId, userId));
  return rows.map((r) => r.f);
}

// one look-up per user every few seconds: many queries of one request each ask who is logged in
// (React's cache only holds inside a page render, not in route handlers)
const recent = new Map<number, { u: User | undefined; at: number }>();
const fresh = async (id: number) => {
  const hit = recent.get(id);
  if (hit && Date.now() - hit.at < 3000) return hit.u;
  const u = await getUser(id);
  if (recent.size > 1000) recent.clear();
  recent.set(id, { u, at: Date.now() });
  return u;
};

/** The logged-in user of this request (or worker job), or null: locked accounts and ended sessions count as logged out. */
export const currentUser = cache(async (): Promise<User | null> => {
  const id = await actorId();
  if (!id) return null;
  const u = await fresh(id);
  if (!u || u.disabled) return null;
  try {
    const { headers } = await import("next/headers");
    const sv = (await headers()).get("x-user-sv");
    if (sv !== null && Number(sv) !== u.sessionVersion) return null; // password changed / logged out everywhere
  } catch {}
  return u;
});

/** May the logged-in user use this feature (own switch, groups, role)? */
export async function mayUse(f: Feature) {
  const u = await currentUser();
  return !!u && canUse(u, f, await groupSwitches(u.id));
}

export const isEditor = async () => !!(await requireRole("editor"));

/** For API routes: the user if their role is at least `min`, else null (answer 403). */
export async function requireRole(min: Role) {
  const u = await currentUser();
  return u && RANK[u.role] >= RANK[min] ? u : null;
}
