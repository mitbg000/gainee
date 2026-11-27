/** Manual editing of a lesson's text: fix paragraphs, split into several lessons, merge with the next one. */
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { regenerate } from "@/lib/documents/queries";
import { canEditDoc } from "@/lib/owner";
import { wordCount } from "@/lib/text/clean";
import { toPlain } from "@/lib/text/rich";
import { locateQuote } from "@/components/lesson/marks";

const { lessons, annotations } = schema;

const words = (ps: string[]) => ps.reduce((a, p) => a + wordCount(p), 0);

/** Keep highlights/notes whose quote still exists in the new text; drop the others. */
async function relocateAnnotations(tx: Pick<ReturnType<typeof getDb>, "select" | "update" | "delete">, lessonId: number, paragraphs: string[]) {
  const rows = await tx.select().from(annotations).where(eq(annotations.lessonId, lessonId));
  const plain = paragraphs.map(toPlain);
  for (const a of rows) {
    if (plain[a.paragraph]?.slice(a.startOffset, a.endOffset) === a.quote) continue;
    const hit = locateQuote(plain, a.quote);
    if (hit) await tx.update(annotations).set({ paragraph: hit.p, startOffset: hit.start, endOffset: hit.end }).where(eq(annotations.id, a.id));
    else await tx.delete(annotations).where(eq(annotations.id, a.id));
  }
}

/** Replace a lesson's text with `parts` (the first part stays this lesson, the rest become new lessons after it). */
export async function editLessonText(lessonId: number, parts: string[][], regen: boolean) {
  const db = getDb();
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
  if (!lesson || !parts.length || !(await canEditDoc(lesson.documentId))) return null;
  const extra = parts.length - 1;
  const newIds: number[] = [];

  await db.transaction(async (tx) => {
    if (extra) {
      // shift later lessons down-to-up so the unique (document, position) index never collides
      const later = await tx.select({ id: lessons.id, position: lessons.position }).from(lessons)
        .where(and(eq(lessons.documentId, lesson.documentId), gt(lessons.position, lesson.position)))
        .orderBy(asc(lessons.position));
      for (const l of later.reverse()) await tx.update(lessons).set({ position: l.position + extra }).where(eq(lessons.id, l.id));
    }
    await tx.update(lessons).set({ paragraphs: parts[0], wordCount: words(parts[0]), ...(regen ? { status: "pending" as const, error: null } : {}) }).where(eq(lessons.id, lessonId));
    await relocateAnnotations(tx, lessonId, parts[0]);
    for (const [i, ps] of parts.slice(1).entries()) {
      const [{ id }] = await tx
        .insert(lessons)
        .values({ documentId: lesson.documentId, position: lesson.position + 1 + i, title: `Part ${lesson.position + 1 + i}`, paragraphs: ps, wordCount: words(ps), status: "pending" })
        .$returningId();
      newIds.push(id);
    }
  });

  // new lessons have no exercises yet, so they are always generated
  const ids = regen ? [lessonId, ...newIds] : newIds;
  const jobId = ids.length ? await regenerate(lesson.documentId, ids) : null;
  return { jobId, newLessonIds: newIds };
}

/** Append the next lesson's text to this one and delete the next lesson. */
export async function mergeWithNext(lessonId: number) {
  const db = getDb();
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
  if (!lesson || !(await canEditDoc(lesson.documentId))) return null;
  const [next] = await db.select().from(lessons).where(and(eq(lessons.documentId, lesson.documentId), eq(lessons.position, lesson.position + 1)));
  if (!next) return null;
  const merged = [...lesson.paragraphs, ...next.paragraphs];

  await db.transaction(async (tx) => {
    // keep the next lesson's highlights: they now sit after this lesson's paragraphs
    await tx.update(annotations).set({ lessonId, paragraph: sql`${annotations.paragraph} + ${lesson.paragraphs.length}` }).where(eq(annotations.lessonId, next.id));
    await tx.delete(lessons).where(eq(lessons.id, next.id));
    await tx.update(lessons).set({ paragraphs: merged, wordCount: words(merged), status: "pending", error: null }).where(eq(lessons.id, lessonId));
    const later = await tx.select({ id: lessons.id, position: lessons.position }).from(lessons)
      .where(and(eq(lessons.documentId, lesson.documentId), gt(lessons.position, next.position)))
      .orderBy(asc(lessons.position));
    for (const l of later) await tx.update(lessons).set({ position: l.position - 1 }).where(eq(lessons.id, l.id));
  });
  return { jobId: await regenerate(lesson.documentId, [lessonId]) };
}
