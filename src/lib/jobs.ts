/** Background job queue stored in MySQL – no Redis needed. */
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

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
    .values({ type, payload, runAt: opts.runAt ?? new Date(), maxAttempts: opts.maxAttempts ?? 3 })
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

export async function setProgress(id: number, progress: string) {
  await getDb().update(jobs).set({ progress }).where(eq(jobs.id, id));
}

export async function complete(id: number, result: unknown = null) {
  await getDb().update(jobs).set({ status: "done", result, finishedAt: new Date(), error: null }).where(eq(jobs.id, id));
}

export async function fail(job: Job, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
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

/** On worker start: jobs left "running" by a crash go back to the queue. */
export async function requeueStale(olderThanMs = 10 * 60 * 1000): Promise<number> {
  const res = (await getDb()
    .update(jobs)
    .set({ status: "queued" })
    .where(and(eq(jobs.status, "running"), lte(jobs.startedAt, new Date(Date.now() - olderThanMs))))) as unknown as Affected;
  return res[0].affectedRows;
}

export async function recentJobs(limit = 20) {
  return getDb().select().from(jobs).orderBy(sql`${jobs.id} desc`).limit(limit);
}
