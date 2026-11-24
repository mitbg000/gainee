/**
 * Active learning with AI: write a sentence with a word (graded), and short review passages built from the words
 * you are about to forget. Both count as reviews for the FSRS schedule.
 */
import { and, asc, eq, gt, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { chat } from "./ai/client";
import { getProfile } from "./profile";
import { gradeWord } from "./review";

const { words } = schema;
const json = (text: string) => JSON.parse(/\{[\s\S]*\}/.exec(text)?.[0] ?? "{}") as Record<string, unknown>;

const SentenceResult = z.object({
  score: z.number().int().min(0).max(2), // 2 natural and correct, 1 right meaning but a mistake, 0 wrong use
  feedback: z.string().max(600),
  better: z.string().max(400),
});
export type SentenceResult = z.infer<typeof SentenceResult>;

/** Grade a learner's sentence using `wordId`; the score is also a review (2 → Good, 1 → Hard, 0 → Again). */
export async function checkSentence(wordId: number, sentence: string): Promise<SentenceResult | null> {
  const [w] = await getDb().select().from(words).where(eq(words.id, wordId));
  if (!w) return null;
  const p = await getProfile();
  const r = await chat({
    task: "reader_quick",
    json: true,
    temperature: 0.2,
    maxTokens: 400,
    messages: [
      { role: "system", content: `You check sentences written by a Vietnamese IELTS learner (CEFR ${p.level}). Reply with ONE JSON object only.` },
      {
        role: "user",
        content: `Target word: "${w.term}"${w.meaningVi ? ` (meaning: ${w.meaningVi})` : ""}
Learner's sentence: """${sentence.slice(0, 500)}"""
Did they use the target word (any form) correctly and naturally?
JSON: {"score": 2 if correct and natural, 1 if the word's meaning is right but there is a grammar/collocation mistake or it sounds unnatural, 0 if the word is missing or misused,
"feedback": "1–2 short sentences in Vietnamese: what is good / what to fix",
"better": "the learner's sentence corrected and made natural (keep their idea), or the same sentence if already good"}`,
      },
    ],
  });
  const res = SentenceResult.parse(json(r.text));
  await gradeWord(wordId, res.score === 2 ? 3 : res.score === 1 ? 2 : 1, "sentence");
  return res;
}

/** Words for a review passage: due now first, then due within 3 days, then the most forgotten; only words already studied. */
export async function passageWords(n = 8) {
  const db = getDb();
  const soon = new Date(Date.now() + 3 * 86400_000);
  const cols = { id: words.id, term: words.term, meaningVi: words.meaningVi, definitionEn: words.definitionEn };
  const due = await db.select(cols).from(words).where(and(eq(words.suspended, false), gt(words.reps, 0), lte(words.due, soon))).orderBy(asc(words.due)).limit(n);
  if (due.length >= 4) return due;
  const more = await db.select(cols).from(words).where(eq(words.suspended, false)).orderBy(asc(words.stability)).limit(n * 2);
  return [...due, ...more.filter((m) => !due.some((d) => d.id === m.id))].slice(0, n);
}

const Passage = z.object({
  title: z.string().max(200),
  passage: z.string().max(4000),
  questions: z.array(z.object({ q: z.string().max(400), answer: z.enum(["T", "F", "NG"]), explanation: z.string().max(600) })).min(1).max(5),
});
export type Passage = z.infer<typeof Passage> & { words: { id: number; term: string; meaning: string }[] };

/** A short IELTS-style passage that uses the given words (marked **like this**), with True/False/Not Given questions. */
export async function makePassage(): Promise<Passage | null> {
  const ws = await passageWords();
  if (ws.length < 3) return null;
  const p = await getProfile();
  const r = await chat({
    task: "reader_quick",
    json: true,
    temperature: 0.9,
    maxTokens: 1500,
    messages: [
      { role: "system", content: `You write short IELTS Academic reading passages for a Vietnamese learner (CEFR ${p.level}). Reply with ONE JSON object only.` },
      {
        role: "user",
        content: `Words to use (each at least once, any form), in a natural way so their meaning is clear from context:
${ws.map((w) => `- ${w.term}`).join("\n")}
Write about one interesting real-world topic (science, society, environment, history, technology…) – 140–190 words, 2 paragraphs.
Mark every use of these words with **double asterisks**.
Then 3 IELTS True/False/Not Given statements about the passage (paraphrased, at least one of each answer), each with a 1-sentence explanation in Vietnamese.
JSON: {"title": "", "passage": "", "questions": [{"q": "", "answer": "T"|"F"|"NG", "explanation": ""}]}`,
      },
    ],
  });
  const out = Passage.parse(json(r.text));
  return { ...out, words: ws.map((w) => ({ id: w.id, term: w.term, meaning: w.meaningVi || w.definitionEn || "" })) };
}

/** After reading: remembered words count as Good, the ones marked "forgot" as Again. */
export async function finishPassage(remembered: number[], forgot: number[]) {
  const db = getDb();
  const ids = [...remembered, ...forgot];
  const exist = ids.length ? new Set((await db.select({ id: words.id }).from(words).where(inArray(words.id, ids))).map((w) => w.id)) : new Set<number>();
  for (const id of remembered) if (exist.has(id)) await gradeWord(id, 3, "passage");
  for (const id of forgot) if (exist.has(id)) await gradeWord(id, 1, "passage");
}
