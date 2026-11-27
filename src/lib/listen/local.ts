/** The jobs of dist/speech.js for an uploaded IELTS book: Part marks of a recording, text of scanned pages. */
import fs from "node:fs/promises";
import path from "node:path";
import { announcements, marksFrom, MODEL, speechAfterPauses, testNumber } from "@/lib/ielts/partMarks";
import { WHOLE_TEST } from "@/lib/ielts/serverRead";
import { UPLOAD_DIR } from "@/lib/storage";
import { decode, RATE } from "./speech";

const CLIP = 7; // seconds heard after each pause

/**
 * A whole-test recording: where each part starts (and the test it announces). A shorter file holds one part: only its
 * first seconds are heard, for "Test 7… Section 2", so a file with a name like "Track05.mp3" still finds its part.
 */
export async function findMarksInFile(file: string) {
  const pcm = await decode(file, 0, null);
  const seconds = pcm.length / RATE;
  const lib = await import("@huggingface/transformers");
  lib.env.cacheDir = path.join(UPLOAD_DIR, "hf-cache");
  const asr = (await lib.pipeline("automatic-speech-recognition", MODEL, { dtype: "q8", session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 } } as Parameters<typeof lib.pipeline>[2])) as unknown as (a: Float32Array, o: Record<string, unknown>) => Promise<{ text: string }>;
  const heard: { start: number; text: string }[] = [];
  const hearAt = async (t: number) => {
    const a = Math.max(0, Math.floor((t - 0.3) * RATE));
    heard.push({ start: t, text: (await asr(pcm.subarray(a, Math.min(pcm.length, a + CLIP * RATE)), { max_new_tokens: 32 })).text });
  };
  if (seconds < WHOLE_TEST) {
    for (const t of speechAfterPauses(pcm).filter((s) => s < 60).slice(0, 5)) {
      await hearAt(t);
      if (heard.some((h) => announcements(h.text).some((x) => !x.end))) break;
    }
    const part = heard.flatMap((h) => announcements(h.text)).find((x) => !x.end)?.part ?? null;
    return { marks: {}, test: testNumber(heard), part, heard, seconds };
  }
  for (const t of speechAfterPauses(pcm)) {
    await hearAt(t);
    if (marksFrom(heard)[4] !== undefined) break;
  }
  const marks = marksFrom(heard);
  return { marks, test: testNumber(heard, marks[1]), part: null, heard, seconds };
}

export async function readPictures(files: string[], print: (o: unknown) => Promise<void>) {
  const { createWorker } = await import("tesseract.js");
  const cachePath = path.join(UPLOAD_DIR, "tessdata"); // the English data is downloaded once and kept
  await fs.mkdir(cachePath, { recursive: true });
  const worker = await createWorker("eng", 1, { cachePath });
  for (const [i, f] of files.entries()) {
    // a picture that cannot be read is left to AI; the others go on
    const r = await worker.recognize(f).catch(() => null);
    await print({ i, text: r?.data.text.trim() ?? "", confidence: r?.data.confidence ?? 0 });
  }
  await worker.terminate();
}
