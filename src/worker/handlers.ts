import type { Job } from "@/lib/jobs";
import { setProgress } from "@/lib/jobs";
import { processDocument } from "@/lib/documents/process";
import { fixBookScripts, importBook } from "@/lib/ielts/import";

export type Handler = (job: Job) => Promise<unknown>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Registered background job types.
 */
export const handlers: Record<string, Handler> = {
  /** Build lessons for an imported document (payload: { documentId, lessonIds? }). */
  generate_document: processDocument,
  /** Read an uploaded IELTS book into tests and questions (payload: { bookId }). */
  ielts_import: importBook,
  /** Repair Listening transcripts whose speaker names came apart from the lines (payload: { bookId }). */
  ielts_fix_scripts: fixBookScripts,

  async ping(job) {
    for (let i = 1; i <= 3; i++) {
      await setProgress(job.id, `step ${i}/3`);
      await sleep(700);
    }
    return { pong: true, at: new Date().toISOString() };
  },
};
