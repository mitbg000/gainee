/** Stand-alone IELTS writing practice (Task 1, Task 2, free writing) with AI prompts and AI band scores. */
import { desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { chat, parseJsonReply, type ChatOptions } from "@/lib/ai/client";
import { getProfile } from "@/lib/profile";
import { wordCount } from "@/lib/text/clean";

const w = schema.writings;
export const WRITING_KINDS = ["task1", "task2", "free"] as const;
export type WritingKind = (typeof WRITING_KINDS)[number];

export const WritingInput = z.object({ kind: z.enum(WRITING_KINDS), prompt: z.string().max(4000), body: z.string().max(20000) });
export const Override = z.object({ providerId: z.number().int().positive(), model: z.string().trim().min(1).max(100) }).optional();

export type Grade = { overall: number; criteria: { key: string; band: number }[]; feedback: string };

/** Writings made on the Writing page (not tied to a lesson), newest first. */
export function listWritings() {
  return getDb()
    .select({ id: w.id, kind: w.kind, prompt: w.prompt, wordCount: w.wordCount, bandOverall: w.bandOverall, updatedAt: w.updatedAt })
    .from(w)
    .where(isNull(w.lessonId))
    .orderBy(desc(w.updatedAt))
    .limit(200);
}

export async function getWriting(id: number) {
  const [row] = await getDb().select().from(w).where(eq(w.id, id));
  return row && !row.lessonId ? row : undefined;
}

export async function saveWriting(id: number | null, data: z.infer<typeof WritingInput>) {
  const values = { kind: data.kind, prompt: data.prompt, body: data.body, wordCount: wordCount(data.body) };
  if (id) {
    await getDb().update(w).set(values).where(eq(w.id, id));
    return id;
  }
  const [{ id: newId }] = await getDb().insert(w).values({ lessonId: null, ...values }).$returningId();
  return newId;
}

const TASK: Record<WritingKind, string> = {
  task1: "IELTS Academic Writing Task 1 (describe a chart, table, diagram, map or process)",
  task2: "IELTS Writing Task 2 (opinion, discussion, problem–solution, advantages–disadvantages or two-part question)",
  free: "short free-writing practice on everyday or academic topics",
};

/** A new practice question. Task 1 has no picture, so the data is given as a small Markdown table. */
export async function generatePrompt(kind: WritingKind, override?: ChatOptions["override"]) {
  const p = await getProfile();
  const extra =
    kind === "task1"
      ? "Include the data as a compact Markdown table (or numbered steps for a process) after the instruction line. End with: Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words."
      : kind === "task2"
        ? "End with: Give reasons for your answer and include any relevant examples from your own knowledge or experience. Write at least 250 words."
        : "One or two sentences only.";
  const r = await chat({
    task: "reader_quick",
    override,
    temperature: 1,
    maxTokens: 600,
    messages: [
      { role: "system", content: `You write realistic exam questions for a learner aiming at IELTS band ${p.targetBand}. Reply with the question only, in English, no title or commentary.` },
      { role: "user", content: `Write one new ${TASK[kind]} question. ${extra}` },
    ],
  });
  return r.text.trim();
}

/** Band scores per IELTS criterion + Markdown feedback, saved on the writing. */
export async function gradeWriting(id: number, override?: ChatOptions["override"]): Promise<Grade> {
  const row = await getWriting(id);
  if (!row) throw new Error("not_found");
  const p = await getProfile();
  const lang = p.explainIn === "vi" ? "Vietnamese" : "English";
  const first = row.kind === "task1" ? "ta" : "tr";
  const r = await chat({
    task: "writing_grade",
    override,
    json: true,
    temperature: 0.2,
    maxTokens: 2500,
    timeoutMs: 120_000,
    messages: [
      {
        role: "system",
        content: `You are a strict but kind IELTS examiner. Score with the official public band descriptors in 0.5 steps.
Reply with JSON only: {"overall": number, "criteria": {"${first}": number, "cc": number, "lr": number, "gra": number}, "feedback": string}
"${first}" = ${first === "ta" ? "Task Achievement" : "Task Response"}, cc = Coherence and Cohesion, lr = Lexical Resource, gra = Grammatical Range and Accuracy.
"feedback" is Markdown in ${lang} (English examples stay English): a short reason for each criterion, the 3–5 most important mistakes with corrections, 3 better words/phrases, and a rewritten version of the weakest paragraph. Note it if the answer is under the word limit or off-topic.`,
      },
      { role: "user", content: `Task type: ${TASK[row.kind as WritingKind] ?? row.kind}\nQuestion:\n"""${row.prompt ?? ""}"""\n\nAnswer (${row.wordCount} words):\n"""${row.body}"""` },
    ],
  });
  const j = parseJsonReply<{ overall?: number; criteria?: Record<string, number>; feedback?: string }>(r.text);
  const band = (x: unknown) => (typeof x === "number" && x >= 0 && x <= 9 ? Math.round(x * 2) / 2 : null);
  const c = j.criteria ?? {};
  const keys = [first, "cc", "lr", "gra"];
  const grade: Grade = {
    overall: band(j.overall) ?? 0,
    criteria: keys.map((k) => ({ key: k, band: band(c[k]) ?? 0 })),
    feedback: String(j.feedback ?? ""),
  };
  await getDb()
    .update(w)
    .set({ bandOverall: grade.overall, band1: band(c[first]), band2: band(c.cc), band3: band(c.lr), band4: band(c.gra), feedback: grade as unknown as Record<string, unknown> })
    .where(eq(w.id, id));
  return grade;
}
