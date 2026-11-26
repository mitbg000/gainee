/**
 * Child process of the worker (dist/speech.js): hears one stretch of a recording and exits, so the ~1 GB Whisper needs
 * is given back at once and the worker itself stays small. Started with low CPU priority (nice) and one thread.
 *   node dist/speech.js <file> <start> <end|"">  → stdout: {"heard":[…],"quiet":[…]}; stderr: "step k/n" lines
 */
import { silences } from "@/lib/listen/segment";
import { decode, hear, RATE } from "@/lib/listen/speech";

async function main() {
  const [file, start, end] = process.argv.slice(2);
  process.stderr.write("step decode\n");
  const pcm = await decode(file, Number(start) || 0, end ? Number(end) : null);
  const quiet = silences(pcm, RATE);
  const heard = await hear(pcm, quiet, (k, n) => process.stderr.write(`step ${k + 1}/${n}\n`));
  process.stdout.write(JSON.stringify({ heard, quiet }), () => process.exit(0)); // exit at once: onnxruntime can abort while shutting down
}

main().catch((e) => {
  process.stderr.write(`error ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
