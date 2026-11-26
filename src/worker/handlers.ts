import type { Job } from "@/lib/jobs";
import { setProgress } from "@/lib/jobs";
import { processDocument } from "@/lib/documents/process";
import { checkBook, fixBookScripts, importBook, resplitBookScripts } from "@/lib/ielts/import";
import { cutAudioClips } from "@/lib/listen/clips";
import { cutParts } from "@/lib/listen/ielts";

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
  /** Split the audioscripts again by their "TEST n" headings; fix parts that got another test's script (payload: { bookId }). */
  ielts_resplit_scripts: resplitBookScripts,
  /** Re-read the parts of a book that miss question numbers, with more pages (payload: { bookId }). */
  ielts_check: checkBook,
  /** Cut IELTS Listening parts into the listening bank with Whisper (payload: { sectionIds }). */
  listen_cut: cutParts,
  /** Cut the sentences of an IELTS recording into small audio files ahead, remove unused ones (payload: { audioId }). */
  listen_clips: cutAudioClips,

  async ping(job) {
    for (let i = 1; i <= 3; i++) {
      await setProgress(job.id, `step ${i}/3`);
      await sleep(700);
    }
    return { pong: true, at: new Date().toISOString() };
  },
};
