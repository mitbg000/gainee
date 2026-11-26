/** Queue for cutting IELTS Listening parts into the listening bank (the work itself runs in the worker: ./ielts.ts). */
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { CANCELLED, enqueue } from "@/lib/jobs";

const { jobs, ieltsSections, ieltsTests, listenSources } = schema;

/** Waiting / running "listen_cut" jobs, with the parts each one holds. */
export async function cutJobs() {
  const rows = await getDb()
    .select({ id: jobs.id, status: jobs.status, progress: jobs.progress, payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.type, "listen_cut"), inArray(jobs.status, ["queued", "running"])))
    .orderBy(asc(jobs.id));
  return rows.map((j) => ({ id: j.id, status: j.status, progress: j.progress, sectionIds: (j.payload.sectionIds as number[]) ?? [] }));
}

/** Parts of a book that have audio and an audioscript and are not in the bank yet. */
export async function bookPartsToCut(bookId: number) {
  const db = getDb();
  const rows = await db
    .select({ id: ieltsSections.id, transcript: ieltsSections.transcript })
    .from(ieltsSections)
    .innerJoin(ieltsTests, eq(ieltsSections.testId, ieltsTests.id))
    .where(and(eq(ieltsTests.bookId, bookId), eq(ieltsSections.skill, "listening"), isNotNull(ieltsSections.audio)))
    .orderBy(asc(ieltsTests.number), asc(ieltsSections.part));
  const have = new Set((await db.select({ s: listenSources.sectionId }).from(listenSources).where(isNotNull(listenSources.sectionId))).map((r) => r.s));
  return rows.filter((r) => r.transcript?.trim() && !have.has(r.id)).map((r) => r.id);
}

/** Queue parts once: parts already waiting or running in a job are not queued again. */
export async function queueCut(sectionIds: number[]) {
  const busy = new Set((await cutJobs()).flatMap((j) => j.sectionIds));
  const todo = [...new Set(sectionIds)].filter((id) => !busy.has(id));
  return todo.length ? enqueue("listen_cut", { sectionIds: todo }, { maxAttempts: 3 }) : null;
}

/** The last finished cut, when something went wrong in it (the whole job, or some of its parts). */
export async function lastCutProblem() {
  const [j] = await getDb()
    .select({ status: jobs.status, error: jobs.error, result: jobs.result, finishedAt: jobs.finishedAt })
    .from(jobs)
    .where(and(eq(jobs.type, "listen_cut"), inArray(jobs.status, ["done", "failed"])))
    .orderBy(desc(jobs.id))
    .limit(1);
  if (!j || (j.finishedAt && Date.now() - j.finishedAt.getTime() > 3 * 86_400_000)) return null;
  if (j.status === "failed") return j.error && j.error !== CANCELLED ? { error: j.error, parts: 0 } : null;
  const bad = ((j.result as { parts?: { error?: string }[] } | null)?.parts ?? []).filter((p) => p.error);
  return bad.length ? { error: bad[0].error!, parts: bad.length } : null;
}
