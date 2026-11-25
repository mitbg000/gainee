/**
 * Background worker (separate PM2 process): processes the job queue and timed tasks.
 * Build: dist/worker.js – run: node --env-file=.env dist/worker.js
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { claimNext, complete, fail, requeueStale } from "@/lib/jobs";
import { setSetting } from "@/lib/settings";
import { handlers } from "./handlers";

const POLL_MS = 1000;
let stopping = false;

const heartbeat = () => setSetting("worker.heartbeat", Date.now()).catch((e) => console.error("[worker] heartbeat:", e));

/** Runs once a minute. Phase 4 sends study reminders (Telegram / web push) from here. */
async function everyMinute(now: Date) {
  void now;
}

async function loop() {
  while (!stopping) {
    let job;
    try {
      job = await claimNext();
    } catch (e) {
      console.error("[worker] cannot read queue:", e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    if (!job) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      continue;
    }
    const handler = handlers[job.type];
    const t0 = Date.now();
    try {
      if (!handler) throw new Error(`No handler for job type "${job.type}"`);
      const result = await handler(job);
      await complete(job.id, result ?? null);
      console.log(`[worker] #${job.id} ${job.type} done in ${Date.now() - t0}ms`);
    } catch (e) {
      await fail(job, e);
      console.error(`[worker] #${job.id} ${job.type} failed:`, e instanceof Error ? e.message : e);
    }
  }
}

async function main() {
  await getDb().execute(sql`select 1`);
  // only one worker runs: a job still "running" when it starts was cut off by a restart (deploy, crash) – run it again now
  const n = await requeueStale(0);
  if (n) console.log(`[worker] re-queued ${n} interrupted job(s)`);
  await heartbeat();
  setInterval(heartbeat, 30_000);
  setInterval(() => everyMinute(new Date()).catch((e) => console.error("[worker] cron:", e)), 60_000);
  console.log("[worker] started, waiting for jobs…");
  await loop();
  await getDb().$client.end();
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`[worker] received ${sig}, shutting down…`);
    stopping = true;
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

main().catch((e) => {
  console.error("[worker] fatal:", e);
  process.exit(1);
});
