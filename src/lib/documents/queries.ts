import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { enqueue } from "@/lib/jobs";
import { removeUpload } from "@/lib/storage";

const { documents, lessons, documentLabels, labels, jobs } = schema;
export type LabelRef = { id: number; kind: "topic" | "source" | "custom"; name: string; emoji: string | null; color: (typeof labels.$inferSelect)["color"] };

export async function labelsForDocuments(ids: number[]): Promise<Map<number, LabelRef[]>> {
  const out = new Map<number, LabelRef[]>();
  if (!ids.length) return out;
  const rows = await getDb()
    .select({ documentId: documentLabels.documentId, id: labels.id, kind: labels.kind, name: labels.name, emoji: labels.emoji, color: labels.color })
    .from(documentLabels)
    .innerJoin(labels, eq(labels.id, documentLabels.labelId))
    .where(inArray(documentLabels.documentId, ids));
  for (const { documentId, ...l } of rows) out.set(documentId, [...(out.get(documentId) ?? []), l]);
  return out;
}

/** Library list, optionally filtered by labels (all must match) and a search term. */
export async function listDocuments(opts: { labelIds?: number[]; q?: string } = {}) {
  const db = getDb();
  const where = [];
  if (opts.q) {
    const q = `%${opts.q.replace(/[%_]/g, "\\$&")}%`;
    where.push(or(like(documents.title, q), like(documents.author, q), like(documents.source, q)));
  }
  for (const labelId of opts.labelIds ?? []) {
    where.push(sql`exists (select 1 from ${documentLabels} dl where dl.document_id = ${documents.id} and dl.label_id = ${labelId})`);
  }
  const docs = await db
    .select({
      id: documents.id,
      title: documents.title,
      author: documents.author,
      source: documents.source,
      sourceType: documents.sourceType,
      wordCount: documents.wordCount,
      level: documents.level,
      status: documents.status,
      createdAt: documents.createdAt,
      lessons: sql<number>`(select count(*) from ${lessons} l where l.document_id = ${documents.id})`,
      ready: sql<number>`(select count(*) from ${lessons} l where l.document_id = ${documents.id} and l.status = 'ready')`,
      done: sql<number>`(select count(*) from ${lessons} l where l.document_id = ${documents.id} and l.completed_at is not null)`,
    })
    .from(documents)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(documents.createdAt))
    .limit(200);
  const labelMap = await labelsForDocuments(docs.map((d) => d.id));
  return docs.map((d) => ({ ...d, lessons: Number(d.lessons), ready: Number(d.ready), done: Number(d.done), labels: labelMap.get(d.id) ?? [] }));
}
export type LibraryItem = Awaited<ReturnType<typeof listDocuments>>[number];

export async function getDocument(id: number) {
  const db = getDb();
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) return null;
  const ls = await db
    .select({
      id: lessons.id,
      position: lessons.position,
      title: lessons.title,
      titleVi: lessons.titleVi,
      wordCount: lessons.wordCount,
      status: lessons.status,
      error: lessons.error,
      completedAt: lessons.completedAt,
      bestScore: lessons.bestScore,
    })
    .from(lessons)
    .where(eq(lessons.documentId, id))
    .orderBy(lessons.position);
  const [job] = await db
    .select({ id: jobs.id, status: jobs.status, progress: jobs.progress, error: jobs.error })
    .from(jobs)
    .where(and(eq(jobs.type, "generate_document"), sql`json_extract(${jobs.payload}, '$.documentId') = ${id}`))
    .orderBy(desc(jobs.id))
    .limit(1);
  const { rawText: _raw, ...rest } = doc;
  void _raw;
  return { ...rest, lessons: ls, labels: (await labelsForDocuments([id])).get(id) ?? [], job: job ?? null };
}
export type DocumentDetail = NonNullable<Awaited<ReturnType<typeof getDocument>>>;

export async function setDocumentLabels(documentId: number, labelIds: number[]) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(documentLabels).where(eq(documentLabels.documentId, documentId));
    if (labelIds.length) {
      const valid = (await tx.select({ id: labels.id }).from(labels).where(inArray(labels.id, labelIds))).map((l) => l.id);
      if (valid.length) await tx.insert(documentLabels).values(valid.map((labelId) => ({ documentId, labelId })));
    }
  });
}

/** Accept AI suggestions: create missing topic/source labels and attach them. */
export async function acceptSuggestions(documentId: number, topics: string[], source: string | null) {
  const db = getDb();
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) return;
  const wanted: { kind: "topic" | "source"; name: string }[] = [
    ...topics.map((name) => ({ kind: "topic" as const, name: name.trim().slice(0, 100) })),
    ...(source ? [{ kind: "source" as const, name: source.trim().slice(0, 100) }] : []),
  ].filter((w) => w.name);
  const ids: number[] = [];
  for (const w of wanted) {
    const [found] = await db.select({ id: labels.id }).from(labels).where(and(eq(labels.kind, w.kind), eq(labels.name, w.name)));
    if (found) ids.push(found.id);
    else {
      const [{ id }] = await db.insert(labels).values({ kind: w.kind, name: w.name, color: w.kind === "source" ? "red" : "blue" }).$returningId();
      ids.push(id);
    }
  }
  const current = ((await labelsForDocuments([documentId])).get(documentId) ?? []).map((l) => l.id);
  await setDocumentLabels(documentId, [...new Set([...current, ...ids])]);
  await db
    .update(documents)
    .set({ source: doc.source ?? source ?? null, meta: { ...(doc.meta ?? {}), suggestedTopics: [], suggestedSource: null } })
    .where(eq(documents.id, documentId));
}

export async function dismissSuggestions(documentId: number) {
  const db = getDb();
  const [doc] = await db.select({ meta: documents.meta }).from(documents).where(eq(documents.id, documentId));
  if (doc) await db.update(documents).set({ meta: { ...(doc.meta ?? {}), suggestedTopics: [], suggestedSource: null } }).where(eq(documents.id, documentId));
}

export async function regenerate(documentId: number, lessonIds?: number[]) {
  const db = getDb();
  if (lessonIds?.length) {
    await db.update(lessons).set({ status: "pending" }).where(and(eq(lessons.documentId, documentId), inArray(lessons.id, lessonIds)));
  }
  await db.update(documents).set({ status: "processing" }).where(eq(documents.id, documentId));
  return enqueue("generate_document", { documentId, ...(lessonIds?.length ? { lessonIds } : {}) }, { maxAttempts: 2 });
}

export async function deleteDocument(id: number) {
  const db = getDb();
  const [doc] = await db.select({ filePath: documents.filePath }).from(documents).where(eq(documents.id, id));
  if (!doc) return;
  await db.delete(documents).where(eq(documents.id, id));
  await removeUpload(doc.filePath);
}

export type TreeDoc = { id: number; title: string; lessons: { id: number; position: number; title: string; done: boolean }[] };

/** Texts and their lessons for the sidebar tree (newest 60 texts). */
export async function sidebarTree(): Promise<TreeDoc[]> {
  const db = getDb();
  const docs = await db.select({ id: documents.id, title: documents.title }).from(documents).orderBy(desc(documents.id)).limit(60);
  if (!docs.length) return [];
  const ls = await db
    .select({ id: lessons.id, documentId: lessons.documentId, position: lessons.position, title: lessons.title, completedAt: lessons.completedAt })
    .from(lessons)
    .where(inArray(lessons.documentId, docs.map((d) => d.id)))
    .orderBy(lessons.position);
  return docs.map((d) => ({
    ...d,
    lessons: ls.filter((l) => l.documentId === d.id).map((l) => ({ id: l.id, position: l.position, title: l.title, done: !!l.completedAt })),
  }));
}
