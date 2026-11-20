import type { Job } from "@/lib/jobs";
import { setProgress } from "@/lib/jobs";
import { processDocument } from "@/lib/documents/process";

export type Handler = (job: Job) => Promise<unknown>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Registered background job types.
 */
export const handlers: Record<string, Handler> = {
  /** Build lessons for an imported document (payload: { documentId, lessonIds? }). */
  generate_document: processDocument,

  async ping(job) {
    for (let i = 1; i <= 3; i++) {
      await setProgress(job.id, `step ${i}/3`);
      await sleep(700);
    }
    return { pong: true, at: new Date().toISOString() };
  },
};
