/**
 * Child process of the worker (dist/speech.js): one heavy local job, then exit, so the memory it needs (~1 GB for
 * speech) is given back at once and the worker itself stays small. Started with low CPU priority (nice) and one thread.
 *   node dist/speech.js <file> <start> <end|"">  → stdout: {"heard":[…],"quiet":[…]}; stderr: "step k/n" lines
 *   node dist/speech.js marks <file>             → stdout: {"marks":{…},"test":n|null,"heard":[…],"seconds":n}
 *   node dist/speech.js ocr <picture…>           → stdout: one line per picture {"i":0,"text":"…","confidence":90}
 */
import { findMarksInFile, readPictures } from "@/lib/listen/local";
import { silences } from "@/lib/listen/segment";
import { decode, hear, RATE } from "@/lib/listen/speech";

const print = (o: unknown) => new Promise<void>((ok) => process.stdout.write(`${JSON.stringify(o)}\n`, () => ok()));

async function main() {
  const [first, ...rest] = process.argv.slice(2);
  if (first === "marks") return print(await findMarksInFile(rest[0]));
  if (first === "ocr") return readPictures(rest, print);
  const [start, end] = rest;
  process.stderr.write("step decode\n");
  const pcm = await decode(first, Number(start) || 0, end ? Number(end) : null);
  const quiet = silences(pcm, RATE);
  const heard = await hear(pcm, quiet, (k, n) => process.stderr.write(`step ${k + 1}/${n}\n`));
  return print({ heard, quiet });
}

main()
  .then(() => process.exit(0)) // exit at once: onnxruntime can abort while shutting down
  .catch((e) => {
    process.stderr.write(`error ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
