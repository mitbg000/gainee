/** Background job queue stored in MySQL – no Redis needed. */
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { actorId } from "@/lib/actor";

const { jobs } = schema;
export type Job = typeof jobs.$inferSelect;

type Affected = [{ affectedRows: number }, unknown];

export async function enqueue(
  type: string,
  payload: Record<string, unknown> = {},
  opts: { runAt?: Date; maxAttempts?: number } = {},
): Promise<number> {
  const [row] = await getDb()
    .insert(jobs)
    .values({ type, payload, userId: await actorId(), runAt: opts.runAt ?? new Date(), maxAttempts: opts.maxAttempts ?? 3 })
    .$returningId();
  return row.id;
}

/**
 * Atomically claim the next due job.
 * Uses an optimistic UPDATE … WHERE status='queued' so it works on MySQL 5.7, 8.0 and MariaDB
 * (no SKIP LOCKED required) and stays safe if several workers ever run.
 */
export async function claimNext(): Promise<Job | undefined> {
  const db = getDb();
  for (let tries = 0; tries < 3; tries++) {
    const next = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.status, "queued"), lte(jobs.runAt, new Date())))
      .orderBy(asc(jobs.runAt), asc(jobs.id))
      .limit(1);
    if (!next.length) return undefined;

    const res = (await db
      .update(jobs)
      .set({ status: "running", startedAt: new Date(), attempts: sql`${jobs.attempts} + 1` })
      .where(and(eq(jobs.id, next[0].id), eq(jobs.status, "queued")))) as unknown as Affected;
    if (res[0].affectedRows === 1) {
      const [job] = await db.select().from(jobs).where(eq(jobs.id, next[0].id));
      return job;
    }
  }
  return undefined;
}

export const CANCELLED = "cancelled";

/** Also the stop point of a cancelled job: it throws once the job is no longer running. */
export async function setProgress(id: number, progress: string) {
  const res = (await getDb().update(jobs).set({ progress }).where(and(eq(jobs.id, id), eq(jobs.status, "running")))) as unknown as Affected;
  if (res[0].affectedRows === 0) throw new Error(CANCELLED);
}

export async function complete(id: number, result: unknown = null) {
  await getDb().update(jobs).set({ status: "done", result, finishedAt: new Date(), error: null }).where(and(eq(jobs.id, id), eq(jobs.status, "running")));
}

/** Stop a waiting job, or a running one at its next step (the AI call in progress still finishes). */
export async function cancelJob(id: number) {
  await getDb().update(jobs).set({ status: "failed", error: CANCELLED, finishedAt: new Date() }).where(and(eq(jobs.id, id), inArray(jobs.status, ["queued", "running"])));
}

export async function fail(job: Job, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === CANCELLED) return; // already marked by cancelJob
  const retry = job.attempts < job.maxAttempts;
  await getDb()
    .update(jobs)
    .set(
      retry
        ? { status: "queued", error: msg, runAt: new Date(Date.now() + 2 ** job.attempts * 15_000) } // 30s, 60s, 120s…
        : { status: "failed", error: msg, finishedAt: new Date() },
    )
    .where(eq(jobs.id, job.id));
}

/**
 * On worker start: jobs left "running" by a crash go back to the queue – unless they already used all their tries
 * (a job that kills the worker every time would otherwise run forever).
 */
export async function requeueStale(olderThanMs = 10 * 60 * 1000): Promise<number> {
  const stale = and(eq(jobs.status, "running"), lte(jobs.startedAt, new Date(Date.now() - olderThanMs)));
  await getDb()
    .update(jobs)
    .set({ status: "failed", error: "interrupted", finishedAt: new Date() })
    .where(and(stale, sql`${jobs.attempts} >= ${jobs.maxAttempts}`));
  const res = (await getDb().update(jobs).set({ status: "queued" }).where(stale)) as unknown as Affected;
  return res[0].affectedRows;
}

export async function recentJobs(limit = 20) {
  return getDb().select().from(jobs).orderBy(sql`${jobs.id} desc`).limit(limit);
}
