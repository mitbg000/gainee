import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { searchable } from "@/components/lesson/marks";
import { canEditDoc, myId, readableLesson } from "@/lib/owner";
import type { LessonContent } from "./generate";

const { lessons, documents, lessonVocab, annotations, aiMessages, words, writings, attempts, answerLogs, lessonProgress } = schema;

export async function getLessonData(id: number) {
  const db = getDb();
  const uid = await myId();
  if (!(await readableLesson(id, uid))) return null;
  const [[row], [progress]] = await Promise.all([
    db.select().from(lessons).where(eq(lessons.id, id)),
    db.select().from(lessonProgress).where(and(eq(lessonProgress.userId, uid), eq(lessonProgress.lessonId, id))),
  ]);
  if (!row) return null;
  // the text is shared, the progress is this learner's
  const lesson = { ...row, completedAt: progress?.completedAt ?? null, bestScore: progress?.bestScore ?? null, notes: progress?.notes ?? null };
  const [doc] = await db
    .select({ id: documents.id, title: documents.title, author: documents.author, source: documents.source })
    .from(documents)
    .where(eq(documents.id, lesson.documentId));
  const [siblings, vocab, notes, ai, writing] = await Promise.all([
    db.select({ id: lessons.id, position: lessons.position, status: lessons.status }).from(lessons).where(eq(lessons.documentId, lesson.documentId)).orderBy(asc(lessons.position)),
    db.select().from(lessonVocab).where(eq(lessonVocab.lessonId, id)).orderBy(asc(lessonVocab.id)),
    db.select().from(annotations).where(and(eq(annotations.userId, uid), eq(annotations.lessonId, id))).orderBy(asc(annotations.paragraph), asc(annotations.startOffset)),
    db
      .select({ id: aiMessages.id, action: aiMessages.action, selection: aiMessages.selection, question: aiMessages.question, answer: aiMessages.answer, model: aiMessages.model, pinned: aiMessages.pinned, annotationId: aiMessages.annotationId, createdAt: aiMessages.createdAt })
      .from(aiMessages)
      .where(and(eq(aiMessages.userId, uid), eq(aiMessages.lessonId, id), or(eq(aiMessages.pinned, true), eq(aiMessages.action, "feedback"))))
      .orderBy(desc(aiMessages.id))
      .limit(50),
    db.select().from(writings).where(and(eq(writings.userId, uid), eq(writings.lessonId, id))),
  ]);
  // every AI-checked answer of the practice tab (paraphrase / speaking / writing), newest first
  const feedback = await db
    .select({ id: aiMessages.id, kind: aiMessages.question, answer: aiMessages.selection, feedback: aiMessages.answer, at: aiMessages.createdAt })
    .from(aiMessages)
    .where(and(eq(aiMessages.userId, uid), eq(aiMessages.lessonId, id), eq(aiMessages.action, "feedback"), isNotNull(aiMessages.answer)))
    .orderBy(desc(aiMessages.id))
    .limit(100);
  const saved = vocab.length
    ? await db.select({ id: words.id, lessonVocabId: words.lessonVocabId }).from(words).where(and(eq(words.userId, uid), inArray(words.lessonVocabId, vocab.map((v) => v.id))))
    : [];
  // the latest exercise attempt, so answers and score are shown again on any device
  const [last] = await db.select().from(attempts).where(and(eq(attempts.userId, uid), eq(attempts.lessonId, id))).orderBy(desc(attempts.id)).limit(1);
  const lastGiven = last ? await db.select({ given: answerLogs.given }).from(answerLogs).where(eq(answerLogs.attemptId, last.id)).orderBy(asc(answerLogs.id)) : [];
  const terms = await db.select({ id: words.id, term: words.term, ipa: words.ipa, pos: words.pos, meaningVi: words.meaningVi, definitionEn: words.definitionEn, example: words.example, note: words.note, context: words.context }).from(words).where(and(eq(words.userId, uid), eq(words.lessonId, id), isNull(words.lessonVocabId))).orderBy(desc(words.id));
  // words saved anywhere else that occur in this text, so the reader can mark them too (scope "whole text" / "all")
  const hay = searchable(lesson.paragraphs.join("\n"));
  const elsewhere = (
    await db
      .select({ id: words.id, term: words.term, documentId: lessons.documentId })
      .from(words)
      .leftJoin(lessons, eq(words.lessonId, lessons.id))
      .where(and(eq(words.userId, uid), or(isNull(words.lessonId), ne(words.lessonId, id))))
      .orderBy(desc(words.id))
  ).filter((o) => hay.includes(searchable(o.term).trim()));
  const sameDoc = new Set(elsewhere.filter((o) => o.documentId === lesson.documentId).map((o) => o.id));
  const others = elsewhere.length
    ? await db
        .select({ id: words.id, term: words.term, ipa: words.ipa, pos: words.pos, meaningVi: words.meaningVi, definitionEn: words.definitionEn, example: words.example, note: words.note, context: words.context })
        .from(words)
        .where(inArray(words.id, elsewhere.slice(0, 1000).map((o) => o.id)))
        .orderBy(desc(words.id))
    : [];
  return {
    otherTerms: others.map((o) => ({ ...o, sameDoc: sameDoc.has(o.id) })),
    lesson: { ...lesson, content: (lesson.content ?? null) as LessonContent | null },
    document: doc,
    canEdit: await canEditDoc(lesson.documentId),
    siblings,
    vocab,
    annotations: notes,
    aiMessages: ai,
    writings: writing,
    feedback,
    savedTermWords: terms,
    lastAttempt: last ? { score: last.score, total: last.total, createdAt: last.createdAt, given: lastGiven.map((g) => g.given ?? "") } : null,
    savedVocab: Object.fromEntries(saved.map((s) => [s.lessonVocabId!, s.id])) as Record<number, number>,
  };
}
export type LessonData = NonNullable<Awaited<ReturnType<typeof getLessonData>>>;
