import type { Job } from "@/lib/jobs";
import { setProgress } from "@/lib/jobs";

export type Handler = (job: Job) => Promise<unknown>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Registered background job types.
 * Phase 1 adds "generate_document" (split text into lessons + call AI).
 */
export const handlers: Record<string, Handler> = {
  async ping(job) {
    for (let i = 1; i <= 3; i++) {
      await setProgress(job.id, `step ${i}/3`);
      await sleep(700);
    }
    return { pong: true, at: new Date().toISOString() };
  },
};
