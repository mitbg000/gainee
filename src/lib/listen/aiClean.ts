/** "Làm sạch bằng AI": the AI joins caption lines into dictation sentences and names the speakers (server only). */
import { chat, parseJsonReply } from "@/lib/ai/client";
import { applyAi, clean, type AiSentence, type CleanRow } from "./clean";

const CHUNK = 60; // lines per request

export async function aiClean<T extends CleanRow>(rows: T[]): Promise<{ rows: T[]; fallback: number; fixed: number }> {
  const out: T[] = [];
  let fallback = 0; // pieces done without AI (its answer did not fit)
  let fixed = 0; // sentences whose AI text changed words: rule-based text kept
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    const lines = part.map((r, k) => `${k}|${r.speaker ?? ""}|${(r.end - r.start).toFixed(1)}s|${r.text}`).join("\n");
    let done: { rows: T[]; fixed: number } | null = null;
    try {
      const { text } = await chat({
        task: "lesson_generate",
        json: true,
        temperature: 0,
        maxTokens: 6000,
        timeoutMs: 150_000,
        messages: [
          {
            role: "system",
            content: `You tidy timed video captions into sentences for a dictation exercise. Lines are "index|speaker|seconds|text".
Rules:
- Remove what is not speech: sound and music tags ((Applause), [Music], (Laughter), ♪ lyrics ♪, >>) and speaker labels in the text ("Chris Anderson:", "CA:").
- Never add, change or reorder a spoken word. You may only leave out non-speech, and fix capital letters and punctuation.
- Group consecutive lines into sentences a learner can write after one listen: join lines that are very short or cut in the middle of a thought; keep each sentence under about 25 words and 8 seconds; never join lines of different speakers.
- Every line index belongs to exactly one sentence, in order, with no gaps.
- speaker: the full name when known (expand initials like "CA" from names in the text), else the speaker given, else null.
Reply with JSON only: {"sentences":[{"from":0,"to":1,"speaker":"Chris Anderson","text":"..."}]}`,
          },
          { role: "user", content: lines },
        ],
      });
      done = applyAi(part, parseJsonReply<{ sentences?: AiSentence[] }>(text).sentences ?? []);
    } catch {
      done = null;
    }
    if (!done) {
      fallback++;
      done = { rows: clean(part).rows, fixed: 0 };
    }
    fixed += done.fixed;
    out.push(...done.rows);
  }
  return { rows: out, fallback, fixed };
}
