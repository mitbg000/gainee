import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { LessonContent } from "./generate";

const { lessons, documents, lessonVocab, annotations, aiMessages, words, writings, attempts, answerLogs } = schema;

export async function getLessonData(id: number) {
  const db = getDb();
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, id));
  if (!lesson) return null;
  const [doc] = await db
    .select({ id: documents.id, title: documents.title, author: documents.author, source: documents.source })
    .from(documents)
    .where(eq(documents.id, lesson.documentId));
  const [siblings, vocab, notes, ai, writing] = await Promise.all([
    db.select({ id: lessons.id, position: lessons.position, status: lessons.status }).from(lessons).where(eq(lessons.documentId, lesson.documentId)).orderBy(asc(lessons.position)),
    db.select().from(lessonVocab).where(eq(lessonVocab.lessonId, id)).orderBy(asc(lessonVocab.id)),
    db.select().from(annotations).where(eq(annotations.lessonId, id)).orderBy(asc(annotations.paragraph), asc(annotations.startOffset)),
    db
      .select({ id: aiMessages.id, action: aiMessages.action, selection: aiMessages.selection, question: aiMessages.question, answer: aiMessages.answer, model: aiMessages.model, pinned: aiMessages.pinned, annotationId: aiMessages.annotationId, createdAt: aiMessages.createdAt })
      .from(aiMessages)
      .where(and(eq(aiMessages.lessonId, id), or(eq(aiMessages.pinned, true), eq(aiMessages.action, "feedback"))))
      .orderBy(desc(aiMessages.id))
      .limit(50),
    db.select().from(writings).where(eq(writings.lessonId, id)),
  ]);
  const saved = vocab.length
    ? await db.select({ id: words.id, lessonVocabId: words.lessonVocabId }).from(words).where(inArray(words.lessonVocabId, vocab.map((v) => v.id)))
    : [];
  // the latest exercise attempt, so answers and score are shown again on any device
  const [last] = await db.select().from(attempts).where(eq(attempts.lessonId, id)).orderBy(desc(attempts.id)).limit(1);
  const lastGiven = last ? await db.select({ given: answerLogs.given }).from(answerLogs).where(eq(answerLogs.attemptId, last.id)).orderBy(asc(answerLogs.id)) : [];
  const terms = await db.select({ id: words.id, term: words.term, ipa: words.ipa, pos: words.pos, meaningVi: words.meaningVi, definitionEn: words.definitionEn, example: words.example, note: words.note, context: words.context }).from(words).where(and(eq(words.lessonId, id), isNull(words.lessonVocabId))).orderBy(desc(words.id));
  return {
    lesson: { ...lesson, content: (lesson.content ?? null) as LessonContent | null },
    document: doc,
    siblings,
    vocab,
    annotations: notes,
    aiMessages: ai,
    writings: writing,
    savedTermWords: terms,
    lastAttempt: last ? { score: last.score, total: last.total, createdAt: last.createdAt, given: lastGiven.map((g) => g.given ?? "") } : null,
    savedVocab: Object.fromEntries(saved.map((s) => [s.lessonVocabId!, s.id])) as Record<number, number>,
  };
}
export type LessonData = NonNullable<Awaited<ReturnType<typeof getLessonData>>>;
