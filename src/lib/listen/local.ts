/** The jobs of dist/speech.js for an uploaded IELTS book: Part marks of a recording, text of scanned pages. */
import fs from "node:fs/promises";
import path from "node:path";
import { marksFrom, MODEL, speechAfterPauses, testNumber } from "@/lib/ielts/partMarks";
import { UPLOAD_DIR } from "@/lib/storage";
import { decode, RATE } from "./speech";

/** A recording shorter than this holds one part, not a whole test: no marks to find. */
const WHOLE_TEST = 15 * 60;
const CLIP = 7; // seconds heard after each pause

export async function findMarksInFile(file: string) {
  const pcm = await decode(file, 0, null);
  const seconds = pcm.length / RATE;
  if (seconds < WHOLE_TEST) return { marks: {}, test: null, heard: [], seconds };
  const lib = await import("@huggingface/transformers");
  lib.env.cacheDir = path.join(UPLOAD_DIR, "hf-cache");
  const asr = (await lib.pipeline("automatic-speech-recognition", MODEL, { dtype: "q8", session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 } } as Parameters<typeof lib.pipeline>[2])) as unknown as (a: Float32Array, o: Record<string, unknown>) => Promise<{ text: string }>;
  const heard: { start: number; text: string }[] = [];
  for (const t of speechAfterPauses(pcm)) {
    const a = Math.max(0, Math.floor((t - 0.3) * RATE));
    heard.push({ start: t, text: (await asr(pcm.subarray(a, Math.min(pcm.length, a + CLIP * RATE)), { max_new_tokens: 32 })).text });
    if (marksFrom(heard)[4] !== undefined) break;
  }
  const marks = marksFrom(heard);
  return { marks, test: testNumber(heard, marks[1]), heard, seconds };
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
