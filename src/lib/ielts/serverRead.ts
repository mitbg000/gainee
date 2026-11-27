/**
 * What the browser can do for free, done in the worker when it was not done there: Tesseract reads scanned pages and
 * Moonshine finds the Part marks of whole-test recordings, both in dist/speech.js (own process, low priority).
 * AI is asked only for what they could not read.
 */
import { spawn } from "node:child_process";
import path from "node:path";

/** A page Tesseract read well enough: some text, and mostly sure of it (maps, handwriting and bad scans are not). */
export const goodOcr = (r: { text: string; confidence: number }) => r.text.replace(/\s+/g, "").length >= 40 && r.confidence >= 70;

/** Marks completed with AI's guesses: only missing parts, only at moments really heard, and in part order. */
export function fillMarks(found: Record<string, number>, guess: Record<string, unknown>, starts: number[]) {
  const out = { ...found };
  for (let p = 1; p <= 4; p++) {
    if (out[p] !== undefined) continue;
    const at = Number(guess[p]);
    const start = starts.find((s) => Math.abs(s - at) <= 1.5);
    if (guess[p] === null || guess[p] === undefined || start === undefined) continue;
    const mark = Math.max(0, Math.floor(start - 0.5));
    if (Object.entries(out).every(([q, v]) => (Number(q) < p ? v < mark - 60 : v > mark + 60))) out[p] = mark;
  }
  return out;
}

/** Seconds from which a recording is a whole test (four parts), not one part. */
export const WHOLE_TEST = 15 * 60;

/**
 * One-part files (in upload order) with the part each one announces → their test. A file that names its test keeps it;
 * otherwise a part number not above the last one starts the next test, from `firstTest`.
 */
export function partFiles(files: { id: number; test: number | null; part: number }[], firstTest: number) {
  const out = new Map<number, { test: number; part: number }>();
  let test = firstTest - 1;
  let prev = Infinity;
  for (const f of files) {
    if (f.test) test = f.test;
    else if (f.part <= prev) test++;
    prev = f.part;
    out.set(f.id, { test, part: f.part });
  }
  return out;
}

/** Run dist/speech.js; each line it prints goes to `onLine`. A thrown `onLine` (job cancelled) stops the child. */
export function runLocal(args: string[], onLine: (line: string) => Promise<void>): Promise<void> {
  return new Promise((ok, no) => {
    const script = path.join(process.cwd(), "dist", "speech.js");
    const p = process.platform === "win32" ? spawn(process.execPath, [script, ...args]) : spawn("nice", ["-n", "19", process.execPath, script, ...args]);
    let rest = "";
    let err = "";
    let lines = 0;
    let last: Promise<void> = Promise.resolve();
    let stopped: unknown = null;
    p.stdout.on("data", (b: Buffer) => {
      const parts = (rest + b).split("\n");
      rest = parts.pop()!;
      for (const line of parts.filter((l) => l.startsWith("{"))) {
        lines++;
        last = last
          .then(() => (stopped ? undefined : onLine(line)))
          .catch((e) => {
            stopped ??= e;
            p.kill();
          });
      }
    });
    p.stderr.on("data", (b: Buffer) => (err = (err + b).slice(-500)));
    p.on("error", no);
    p.on("close", async (code, signal) => {
      await last;
      if (stopped) return no(stopped);
      // onnxruntime may abort while shutting down after the output was written
      if (code === 0 || (lines && args[0] === "marks")) return ok();
      no(new Error(err.trim() || `local_read_failed ${signal ?? code}`));
    });
  });
}
