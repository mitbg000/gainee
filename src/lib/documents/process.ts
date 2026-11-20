/** Worker side of the import: document overview + one AI call per lesson, with progress. */
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { setProgress, type Job } from "@/lib/jobs";
import { generateLesson, generateMeta } from "@/lib/lessons/generate";
import { getProfile } from "@/lib/profile";
import { toPlain } from "@/lib/text/rich";

const { documents, lessons, lessonVocab, labels } = schema;

export async function processDocument(job: Job) {
  const documentId = Number(job.payload.documentId);
  const only = Array.isArray(job.payload.lessonIds) ? (job.payload.lessonIds as number[]) : null;
  const db = getDb();
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) return { skipped: "document deleted" };
  const profile = await getProfile();

  await db.update(documents).set({ status: "processing", error: null }).where(eq(documents.id, documentId));

  // 1) overview: summary, level, suggested topics/source (only the first time)
  if (!doc.meta?.summary && !only) {
    await setProgress(job.id, "overview");
    try {
      const topics = (await db.select({ name: labels.name }).from(labels).where(eq(labels.kind, "topic"))).map((t) => t.name);
      const meta = await generateMeta(doc.rawText.slice(0, 9000), topics, profile);
      await db
        .update(documents)
        .set({
          level: meta.level?.toUpperCase().slice(0, 2) || doc.level,
          author: doc.author ?? meta.author ?? null,
          title: !doc.meta?.userTitle && meta.title ? meta.title.slice(0, 500) : doc.title,
          meta: { ...(doc.meta ?? {}), summary: meta.summary ?? "", suggestedTopics: meta.topics, suggestedSource: doc.source ? null : meta.source ?? null },
        })
        .where(eq(documents.id, documentId));
    } catch (e) {
      console.warn(`[generate] overview failed for document ${documentId}:`, e instanceof Error ? e.message : e);
    }
  }

  // 2) lessons, one by one
  const [fresh] = await db.select({ title: documents.title }).from(documents).where(eq(documents.id, documentId));
  const all = await db.select().from(lessons).where(eq(lessons.documentId, documentId)).orderBy(asc(lessons.position));
  const todo = all.filter((l) => (only ? only.includes(l.id) : l.status !== "ready"));
  let failed = 0;
  for (const [i, l] of todo.entries()) {
    await setProgress(job.id, `lesson ${i + 1}/${todo.length}`);
    await db.update(lessons).set({ status: "generating", error: null }).where(eq(lessons.id, l.id));
    try {
      const g = await generateLesson(l.paragraphs.map(toPlain).filter(Boolean), { documentTitle: fresh.title, part: l.position, parts: all.length, profile });
      await db.transaction(async (tx) => {
        await tx.delete(lessonVocab).where(eq(lessonVocab.lessonId, l.id));
        if (g.vocab.length) {
          await tx.insert(lessonVocab).values(
            g.vocab.map((v) => ({
              lessonId: l.id,
              headword: v.headword.slice(0, 191),
              match: v.match.slice(0, 191),
              ipa: v.ipa ?? null,
              pos: v.pos ?? null,
              meaningVi: v.meaningVi,
              definitionEn: v.definitionEn ?? null,
              example: v.example ?? null,
              note: v.note ?? null,
              context: v.context,
              cefr: v.cefr ?? null,
            })),
          );
        }
        await tx
          .update(lessons)
          .set({ title: g.title.slice(0, 500), titleVi: g.titleVi?.slice(0, 500) ?? null, warmup: g.warmup, summary: g.summary, content: g.content, status: "ready", error: null })
          .where(eq(lessons.id, l.id));
      });
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      await db.update(lessons).set({ status: "error", error: msg.slice(0, 1000) }).where(eq(lessons.id, l.id));
      console.error(`[generate] lesson ${l.id} failed:`, msg);
      if (/not_configured|No AI provider/i.test(msg)) break; // no point trying the rest
    }
  }

  const statuses = await db.select({ s: lessons.status }).from(lessons).where(eq(lessons.documentId, documentId));
  const ready = statuses.filter((x) => x.s === "ready").length;
  await db
    .update(documents)
    .set(
      ready > 0
        ? { status: "ready", error: failed ? `${failed} lesson(s) failed` : null }
        : { status: "error", error: "All lessons failed – check AI settings and try again." },
    )
    .where(eq(documents.id, documentId));
  // lessons left in "generating" by an interrupted run go back to pending
  await db.update(lessons).set({ status: "pending" }).where(and(eq(lessons.documentId, documentId), inArray(lessons.status, ["generating"])));
  return { ready, failed };
}
