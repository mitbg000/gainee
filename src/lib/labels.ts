/** User-defined labels (topics, sources, custom) for texts and words. */
import { asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { LABEL_COLORS } from "@/db/schema";

const { labels, documentLabels, wordLabels } = schema;
export type Label = typeof labels.$inferSelect;
export type LabelWithCounts = Label & { documents: number; words: number };

export const MAX_TOPIC_DEPTH = 3;

export const LabelInput = z.object({
  kind: z.enum(["topic", "source", "custom"]),
  name: z.string().trim().min(1).max(100),
  emoji: z.string().trim().max(16).nullish(),
  color: z.enum(LABEL_COLORS).default("gray"),
  parentId: z.number().int().positive().nullish(),
  description: z.string().trim().max(500).nullish(),
});
export const LabelPatch = LabelInput.partial().extend({ position: z.number().int().optional() });

export async function listLabels(): Promise<LabelWithCounts[]> {
  const db = getDb();
  const [rows, docCounts, wordCounts] = await Promise.all([
    db.select().from(labels).orderBy(asc(labels.kind), asc(labels.position), asc(labels.name)),
    db.select({ id: documentLabels.labelId, n: count() }).from(documentLabels).groupBy(documentLabels.labelId),
    db.select({ id: wordLabels.labelId, n: count() }).from(wordLabels).groupBy(wordLabels.labelId),
  ]);
  const d = new Map(docCounts.map((r) => [r.id, r.n]));
  const w = new Map(wordCounts.map((r) => [r.id, r.n]));
  return rows.map((l) => ({ ...l, documents: d.get(l.id) ?? 0, words: w.get(l.id) ?? 0 }));
}

/** Parent must be a topic, must not create a cycle, and the tree stays ≤ MAX_TOPIC_DEPTH levels. */
async function checkParent(kind: string, parentId: number | null | undefined, selfId?: number) {
  if (!parentId) return null;
  if (kind !== "topic") throw new LabelError("parent_only_for_topics");
  const all = await getDb().select({ id: labels.id, kind: labels.kind, parentId: labels.parentId }).from(labels);
  const byId = new Map(all.map((l) => [l.id, l]));
  const parent = byId.get(parentId);
  if (!parent || parent.kind !== "topic") throw new LabelError("invalid_parent");
  let depth = 1;
  for (let cur: number | null = parentId; cur; cur = byId.get(cur)?.parentId ?? null) {
    if (cur === selfId) throw new LabelError("cycle");
    depth++;
  }
  if (depth > MAX_TOPIC_DEPTH) throw new LabelError("too_deep");
  return parentId;
}

export class LabelError extends Error {}

/** MySQL duplicate-key error; Drizzle wraps driver errors in `cause`. */
function isDuplicate(e: unknown): boolean {
  for (let cur = e as { code?: string; cause?: unknown } | undefined; cur; cur = cur.cause as typeof cur) {
    if (cur.code === "ER_DUP_ENTRY") return true;
  }
  return false;
}

export async function createLabel(input: z.infer<typeof LabelInput>) {
  const parentId = await checkParent(input.kind, input.parentId);
  try {
    const [{ id }] = await getDb()
      .insert(labels)
      .values({ ...input, emoji: input.emoji || null, description: input.description || null, parentId })
      .$returningId();
    return id;
  } catch (e) {
    if (isDuplicate(e)) throw new LabelError("duplicate");
    throw e;
  }
}

export async function updateLabel(id: number, patch: z.infer<typeof LabelPatch>) {
  const db = getDb();
  const [cur] = await db.select().from(labels).where(eq(labels.id, id));
  if (!cur) throw new LabelError("not_found");
  const kind = patch.kind ?? cur.kind;
  const parentId = patch.parentId === undefined ? cur.parentId : await checkParent(kind, patch.parentId, id);
  try {
    await db
      .update(labels)
      .set({ ...patch, parentId: kind === "topic" ? parentId : null })
      .where(eq(labels.id, id));
  } catch (e) {
    if (isDuplicate(e)) throw new LabelError("duplicate");
    throw e;
  }
}

/** Deleting a topic moves its sub-topics up one level; assignments are removed by FK cascade. */
export async function deleteLabel(id: number) {
  const db = getDb();
  const [cur] = await db.select().from(labels).where(eq(labels.id, id));
  if (!cur) return;
  await db.transaction(async (tx) => {
    await tx.update(labels).set({ parentId: cur.parentId }).where(eq(labels.parentId, id));
    await tx.delete(labels).where(eq(labels.id, id));
  });
}

/** Common IELTS topics, offered as a one-click starter set. */
export const IELTS_TOPICS: { name: string; emoji: string; color: (typeof LABEL_COLORS)[number] }[] = [
  { name: "Education", emoji: "🎓", color: "blue" },
  { name: "Health & Medicine", emoji: "🩺", color: "red" },
  { name: "Environment", emoji: "🌱", color: "green" },
  { name: "Technology", emoji: "💻", color: "indigo" },
  { name: "Work & Careers", emoji: "💼", color: "amber" },
  { name: "Society & Culture", emoji: "🏛️", color: "purple" },
  { name: "Science", emoji: "🔬", color: "teal" },
  { name: "Media & Advertising", emoji: "📺", color: "pink" },
  { name: "Government & Law", emoji: "⚖️", color: "gray" },
  { name: "Travel & Tourism", emoji: "✈️", color: "orange" },
  { name: "Sport & Leisure", emoji: "⚽", color: "green" },
  { name: "Economy & Business", emoji: "📈", color: "amber" },
];

export async function addIeltsTopics() {
  const existing = new Set(
    (await getDb().select({ name: labels.name }).from(labels).where(eq(labels.kind, "topic"))).map((r) => r.name.toLowerCase()),
  );
  const fresh = IELTS_TOPICS.filter((t) => !existing.has(t.name.toLowerCase()));
  if (fresh.length) {
    await getDb()
      .insert(labels)
      .values(fresh.map((t, i) => ({ kind: "topic" as const, ...t, position: i })));
  }
  return fresh.length;
}

