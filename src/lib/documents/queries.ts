import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { enqueue } from "@/lib/jobs";
import { canEditDoc, docVisible, myId } from "@/lib/owner";
import { isEditor } from "@/lib/users";
import { removeUpload } from "@/lib/storage";

const { documents, lessons, documentLabels, documentGroups, labels, jobs, lessonProgress } = schema;
export type LabelRef = { id: number; kind: "topic" | "source" | "custom"; name: string; emoji: string | null; color: (typeof labels.$inferSelect)["color"] };

export async function labelsForDocuments(ids: number[]): Promise<Map<number, LabelRef[]>> {
  const out = new Map<number, LabelRef[]>();
  if (!ids.length) return out;
  const rows = await getDb()
    .select({ documentId: documentLabels.documentId, id: labels.id, kind: labels.kind, name: labels.name, emoji: labels.emoji, color: labels.color })
    .from(documentLabels)
    .innerJoin(labels, eq(labels.id, documentLabels.labelId))
    .where(and(inArray(documentLabels.documentId, ids), eq(labels.userId, await myId()))); // each learner labels texts their own way
  for (const { documentId, ...l } of rows) out.set(documentId, [...(out.get(documentId) ?? []), l]);
  return out;
}

/** Library list, optionally filtered by labels (all must match) and a search term. */
// Drizzle writes a column of the main table without its table name ("id") when a query reads one table,
// and inside a subquery over lessons that "id" would mean lessons.id – so name it in full.
const DOC_ID = sql.raw("`documents`.`id`");

export async function listDocuments(opts: { labelIds?: number[]; q?: string } = {}) {
  const db = getDb();
  const uid = await myId();
  const where = [docVisible(uid)];
  // this learner's own finished parts (texts may be shared)
  const done = sql`exists (select 1 from lesson_progress lp where lp.lesson_id = l.id and lp.user_id = ${uid} and lp.completed_at is not null)`;
  if (opts.q) {
    const q = `%${opts.q.replace(/[%_]/g, "\\$&")}%`;
    where.push(or(like(documents.title, q), like(documents.author, q), like(documents.source, q)));
  }
  for (const labelId of opts.labelIds ?? []) {
    where.push(sql`exists (select 1 from ${documentLabels} dl where dl.document_id = ${DOC_ID} and dl.label_id = ${labelId})`);
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
      visibility: documents.visibility,
      mine: sql<number>`${documents.userId} = ${uid}`,
      lessons: sql<number>`(select count(*) from ${lessons} l where l.document_id = ${DOC_ID})`,
      ready: sql<number>`(select count(*) from ${lessons} l where l.document_id = ${DOC_ID} and l.status = 'ready')`,
      done: sql<number>`(select count(*) from ${lessons} l where l.document_id = ${DOC_ID} and ${done})`,
      // the first unfinished part, to continue reading from the library
      nextLessonId: sql<number | null>`(select l.id from ${lessons} l where l.document_id = ${DOC_ID} and not ${done} order by l.position limit 1)`,
      nextPosition: sql<number | null>`(select l.position from ${lessons} l where l.document_id = ${DOC_ID} and not ${done} order by l.position limit 1)`,
      firstLessonId: sql<number | null>`(select l.id from ${lessons} l where l.document_id = ${DOC_ID} order by l.position limit 1)`,
      // latest reading session, exercise attempt or finished part (no derived table: MySQL 5.7 / MariaDB cannot correlate one)
      lastRead: sql<string | null>`nullif(greatest(
        coalesce((select max(rs.created_at) from reading_sessions rs join ${lessons} l on l.id = rs.lesson_id where l.document_id = ${DOC_ID} and rs.user_id = ${uid}), '1000-01-01'),
        coalesce((select max(a.created_at) from attempts a join ${lessons} l on l.id = a.lesson_id where l.document_id = ${DOC_ID} and a.user_id = ${uid}), '1000-01-01'),
        coalesce((select max(lp.completed_at) from lesson_progress lp join ${lessons} l on l.id = lp.lesson_id where l.document_id = ${DOC_ID} and lp.user_id = ${uid}), '1000-01-01')), '1000-01-01')`,
    })
    .from(documents)
    .where(and(...where))
    .orderBy(desc(documents.createdAt))
    .limit(200);
  const labelMap = await labelsForDocuments(docs.map((d) => d.id));
  return docs.map((d) => ({
    ...d,
    mine: !!Number(d.mine),
    lessons: Number(d.lessons),
    ready: Number(d.ready),
    done: Number(d.done),
    nextLessonId: d.nextLessonId == null ? null : Number(d.nextLessonId),
    nextPosition: d.nextPosition == null ? null : Number(d.nextPosition),
    firstLessonId: d.firstLessonId == null ? null : Number(d.firstLessonId),
    lastRead: d.lastRead ? new Date(d.lastRead).toISOString() : null,
    labels: labelMap.get(d.id) ?? [],
  }));
}
export type LibraryItem = Awaited<ReturnType<typeof listDocuments>>[number];

export async function getDocument(id: number) {
  const db = getDb();
  const uid = await myId();
  const [doc] = await db.select().from(documents).where(and(eq(documents.id, id), docVisible(uid)));
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
      completedAt: lessonProgress.completedAt,
      bestScore: lessonProgress.bestScore,
    })
    .from(lessons)
    .leftJoin(lessonProgress, and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, uid)))
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
  const groupIds = (await db.select({ id: documentGroups.groupId }).from(documentGroups).where(eq(documentGroups.documentId, id))).map((g) => g.id);
  return { ...rest, lessons: ls, labels: (await labelsForDocuments([id])).get(id) ?? [], job: job ?? null, groupIds, canEdit: await canEditDoc(id) };
}
export type DocumentDetail = NonNullable<Awaited<ReturnType<typeof getDocument>>>;

export async function setDocumentLabels(documentId: number, labelIds: number[]) {
  const db = getDb();
  const uid = await myId();
  const [visible] = await db.select({ id: documents.id }).from(documents).where(and(eq(documents.id, documentId), docVisible(uid)));
  if (!visible) return;
  const mineIds = (await db.select({ id: labels.id }).from(labels).where(eq(labels.userId, uid))).map((l) => l.id);
  await db.transaction(async (tx) => {
    if (mineIds.length) await tx.delete(documentLabels).where(and(eq(documentLabels.documentId, documentId), inArray(documentLabels.labelId, mineIds)));
    if (labelIds.length) {
      const valid = labelIds.filter((l) => mineIds.includes(l));
      if (valid.length) await tx.insert(documentLabels).values(valid.map((labelId) => ({ documentId, labelId })));
    }
  });
}

/** Accept AI suggestions: create missing topic/source labels and attach them. */
export async function acceptSuggestions(documentId: number, topics: string[], source: string | null) {
  const db = getDb();
  if (!(await canEditDoc(documentId))) return;
  const uid = await myId();
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) return;
  const wanted: { kind: "topic" | "source"; name: string }[] = [
    ...topics.map((name) => ({ kind: "topic" as const, name: name.trim().slice(0, 100) })),
    ...(source ? [{ kind: "source" as const, name: source.trim().slice(0, 100) }] : []),
  ].filter((w) => w.name);
  const ids: number[] = [];
  for (const w of wanted) {
    const [found] = await db.select({ id: labels.id }).from(labels).where(and(eq(labels.userId, uid), eq(labels.kind, w.kind), eq(labels.name, w.name)));
    if (found) ids.push(found.id);
    else {
      const [{ id }] = await db.insert(labels).values({ userId: uid, kind: w.kind, name: w.name, color: w.kind === "source" ? "red" : "blue" }).$returningId();
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
  if (!(await canEditDoc(documentId))) return;
  const [doc] = await db.select({ meta: documents.meta }).from(documents).where(eq(documents.id, documentId));
  if (doc) await db.update(documents).set({ meta: { ...(doc.meta ?? {}), suggestedTopics: [], suggestedSource: null } }).where(eq(documents.id, documentId));
}

export async function regenerate(documentId: number, lessonIds?: number[]) {
  const db = getDb();
  if (!(await canEditDoc(documentId))) throw new Error("forbidden");
  if (lessonIds?.length) {
    await db.update(lessons).set({ status: "pending" }).where(and(eq(lessons.documentId, documentId), inArray(lessons.id, lessonIds)));
  }
  await db.update(documents).set({ status: "processing" }).where(eq(documents.id, documentId));
  return enqueue("generate_document", { documentId, ...(lessonIds?.length ? { lessonIds } : {}) }, { maxAttempts: 2 });
}

export async function deleteDocument(id: number) {
  const db = getDb();
  if (!(await canEditDoc(id))) return;
  const [doc] = await db.select({ filePath: documents.filePath }).from(documents).where(eq(documents.id, id));
  if (!doc) return;
  await db.delete(documents).where(eq(documents.id, id));
  await removeUpload(doc.filePath);
}

export type TreeDoc = { id: number; title: string; lessons: { id: number; position: number; title: string; done: boolean }[] };

/** Texts and their lessons for the sidebar tree (newest 60 texts). */
export async function sidebarTree(): Promise<TreeDoc[]> {
  const db = getDb();
  const uid = await myId();
  const docs = await db.select({ id: documents.id, title: documents.title }).from(documents).where(docVisible(uid)).orderBy(desc(documents.id)).limit(60);
  if (!docs.length) return [];
  const ls = await db
    .select({ id: lessons.id, documentId: lessons.documentId, position: lessons.position, title: lessons.title, completedAt: lessonProgress.completedAt })
    .from(lessons)
    .leftJoin(lessonProgress, and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, uid)))
    .where(inArray(lessons.documentId, docs.map((d) => d.id)))
    .orderBy(lessons.position);
  return docs.map((d) => ({
    ...d,
    lessons: ls.filter((l) => l.documentId === d.id).map((l) => ({ id: l.id, position: l.position, title: l.title, done: !!l.completedAt })),
  }));
}

/** Who besides the owner sees a text: nobody, every learner, or the chosen groups. Owner or admin only. */
export async function setVisibility(documentId: number, visibility: "private" | "public" | "groups", groupIds: number[]) {
  if (!(await canEditDoc(documentId)) || !(await isEditor())) return false; // publishing is for editors and admins
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.update(documents).set({ visibility }).where(eq(documents.id, documentId));
    await tx.delete(documentGroups).where(eq(documentGroups.documentId, documentId));
    if (visibility === "groups" && groupIds.length) await tx.insert(documentGroups).values([...new Set(groupIds)].map((groupId) => ({ documentId, groupId })));
  });
  return true;
}
