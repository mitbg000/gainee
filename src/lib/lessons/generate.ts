/**
 * AI lesson generation with validation against the source text.
 *
 * The AI only *proposes* content. Before anything is saved we check that
 *  - every vocabulary item really occurs in the lesson text,
 *  - every True/False and multiple-choice answer is backed by a quote that exists in the text,
 *  - sentence-structure examples and the paraphrase source are real sentences from the text.
 * Invalid items are dropped; if too few survive, the AI is asked again with the list of problems.
 */
import { z } from "zod";
import { chat, parseJsonReply, type ChatMessage } from "@/lib/ai/client";
import type { Profile } from "@/lib/profile";
import { containsQuote, containsWord, sentenceContaining } from "@/lib/text/match";

/* ---------- schemas ---------- */
const str = (max = 2000) => z.string().trim().max(max);

const VocabItem = z.object({
  headword: str(100).min(1),
  match: str(100).min(1),
  ipa: str(100).optional().nullable(),
  pos: str(32).optional().nullable(),
  meaningVi: str(300).min(1),
  definitionEn: str(300).optional().nullable(),
  example: str(400).optional().nullable(),
  note: str(300).optional().nullable(),
  cefr: z.string().trim().max(4).optional().nullable(),
});

const Tfng = z.object({ q: str(400).min(5), answer: z.enum(["T", "F", "NG"]), evidence: str(600).optional().nullable(), explanation: str(800) });
const Mcq = z.object({
  q: str(400).min(5),
  options: z.array(str(300).min(1)).length(4),
  answer: z.number().int().min(0).max(3),
  evidence: str(600).optional().nullable(),
  explanation: str(800),
});
const Gap = z.object({ sentence: str(400).regex(/_{3,}/), answers: z.array(str(80).min(1)).min(1).max(4) });
const Structure = z.object({ sentence: str(600).min(5), explanation: str(800).min(5) });

export const AiLesson = z.object({
  title: str(120).min(2),
  titleVi: str(160).optional().nullable(),
  warmup: str(500).optional().nullable(),
  summary: str(1500).min(20),
  vocab: z.array(z.unknown()),
  tfng: z.array(z.unknown()),
  mcq: z.array(z.unknown()),
  gaps: z.array(z.unknown()),
  structures: z.array(z.unknown()).default([]),
  paraphrase: z.object({ source: str(600), model: str(600) }).optional().nullable(),
  speaking: z.object({ question: str(600).min(5), ideas: z.array(str(300)).max(6).default([]), kind: z.enum(["speaking", "writing"]).default("speaking") }).optional().nullable(),
});

export type LessonContent = {
  tfng: z.infer<typeof Tfng>[];
  mcq: z.infer<typeof Mcq>[];
  gaps: z.infer<typeof Gap>[];
  structures: z.infer<typeof Structure>[];
  paraphrase: { source: string; model: string } | null;
  speaking: { question: string; ideas: string[]; kind: "speaking" | "writing" } | null;
};
export type GeneratedVocab = z.infer<typeof VocabItem> & { context: string | null };
export type GeneratedLesson = {
  title: string;
  titleVi: string | null;
  warmup: string | null;
  summary: string;
  vocab: GeneratedVocab[];
  content: LessonContent;
};

/* ---------- prompt ---------- */
function systemPrompt(profile: Profile) {
  const lang = profile.explainIn === "vi" ? "Vietnamese" : "English";
  return `You are an expert IELTS teacher who turns authentic reading passages into short study lessons for a Vietnamese learner.
Learner: CEFR ${profile.level}, target IELTS band ${profile.targetBand}.
Write all explanations, the summary, the warm-up and the speaking ideas in ${lang}. "meaningVi" is ALWAYS Vietnamese.
Return ONE JSON object only – no markdown, no comments.

Rules (strict – your output is checked automatically against the text):
- vocab: 8–12 items that are useful for IELTS and slightly above the learner's level (skip very easy words and proper names).
  "match" MUST be copied exactly as it appears in the text (inflected form, e.g. "smothered"), "headword" is the dictionary form ("smother").
  Include IPA (British), part of speech (n., v., adj., adv., phr.v., idiom…), a short English definition, a NEW example sentence, and a collocation/usage note.
- tfng: exactly 4 IELTS True/False/Not Given statements, PARAPHRASED (do not copy sentences). Use at least one of each answer type.
  For T and F, "evidence" MUST be a verbatim quote from the text (5–25 words). For NG use evidence null and explain why it is not given.
- mcq: exactly 2 questions with 4 options, "answer" = index 0–3, verbatim "evidence".
- gaps: exactly 4 NEW sentences (not from the text) each containing "______" to be filled with one of the vocab items (give accepted answers in the form needed).
- structures: 2 sentences copied verbatim from the text whose grammar is worth learning for IELTS Writing/Speaking, with a clear explanation.
- paraphrase: one sentence copied verbatim from the text ("source") and a model paraphrase ("model").
- speaking: one IELTS Speaking Part 3 question (or a Writing Task 2 prompt, kind "writing") related to the passage, plus 3–4 idea hints.
- title: a short English title for this part; titleVi: Vietnamese title; warmup: one pre-reading question; summary: 3–5 sentences.

JSON shape:
{"title":"","titleVi":"","warmup":"","summary":"",
 "vocab":[{"headword":"","match":"","ipa":"","pos":"","meaningVi":"","definitionEn":"","example":"","note":"","cefr":"B2"}],
 "tfng":[{"q":"","answer":"T","evidence":"","explanation":""}],
 "mcq":[{"q":"","options":["","","",""],"answer":0,"evidence":"","explanation":""}],
 "gaps":[{"sentence":"... ______ ...","answers":[""]}],
 "structures":[{"sentence":"","explanation":""}],
 "paraphrase":{"source":"","model":""},
 "speaking":{"question":"","ideas":[""],"kind":"speaking"}}`;
}

function userPrompt(paragraphs: string[], ctx: { documentTitle: string; part: number; parts: number }) {
  return `Article: "${ctx.documentTitle}" – part ${ctx.part} of ${ctx.parts}.

<text>
${paragraphs.join("\n\n")}
</text>`;
}

/* ---------- validation ---------- */
type Check = { lesson: GeneratedLesson; problems: string[]; good: boolean };

export function validateLesson(raw: unknown, paragraphs: string[]): Check {
  const text = paragraphs.join("\n");
  const base = AiLesson.parse(raw);
  const problems: string[] = [];

  const vocab: GeneratedVocab[] = [];
  const seen = new Set<string>();
  for (const v of base.vocab) {
    const r = VocabItem.safeParse(v);
    if (!r.success) continue;
    const item = r.data;
    let match = item.match;
    if (!containsWord(text, match)) {
      if (containsWord(text, item.headword)) match = item.headword;
      else {
        problems.push(`vocab "${item.match}" does not occur in the text`);
        continue;
      }
    }
    const key = item.headword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    vocab.push({ ...item, match, context: sentenceContaining(paragraphs, match) });
  }

  const tfng = base.tfng.flatMap((x, i) => {
    const r = Tfng.safeParse(x);
    if (!r.success) return problems.push(`tfng #${i + 1} has an invalid shape`), [];
    if (r.data.answer !== "NG" && !containsQuote(text, r.data.evidence)) return problems.push(`tfng #${i + 1}: evidence is not a verbatim quote`), [];
    return [{ ...r.data, evidence: r.data.answer === "NG" ? null : r.data.evidence ?? null }];
  });
  const mcq = base.mcq.flatMap((x, i) => {
    const r = Mcq.safeParse(x);
    if (!r.success) return problems.push(`mcq #${i + 1} has an invalid shape`), [];
    if (!containsQuote(text, r.data.evidence)) return problems.push(`mcq #${i + 1}: evidence is not a verbatim quote`), [];
    return [r.data];
  });
  const gaps = base.gaps.flatMap((x, i) => {
    const r = Gap.safeParse(x);
    return r.success ? [r.data] : (problems.push(`gap #${i + 1} must contain "______" and answers`), []);
  });
  const structures = base.structures.flatMap((x) => {
    const r = Structure.safeParse(x);
    return r.success && containsQuote(text, r.data.sentence) ? [r.data] : [];
  });
  const paraphrase = base.paraphrase && containsQuote(text, base.paraphrase.source) ? base.paraphrase : null;

  if (vocab.length < 5) problems.push(`only ${vocab.length} valid vocabulary items (need 8–12 that occur in the text)`);
  if (tfng.length < 3) problems.push(`only ${tfng.length} valid TFNG items (need 4)`);
  if (gaps.length < 2) problems.push(`only ${gaps.length} valid gap-fill items (need 4)`);

  return {
    lesson: {
      title: base.title,
      titleVi: base.titleVi ?? null,
      warmup: base.warmup ?? null,
      summary: base.summary,
      vocab: vocab.slice(0, 14),
      content: { tfng, mcq, gaps, structures, paraphrase, speaking: base.speaking ?? null },
    },
    problems,
    good: vocab.length >= 5 && tfng.length >= 3 && gaps.length >= 2,
  };
}

/** Ask the AI, validate, and retry with feedback (max `attempts`). Returns the best result. */
export async function generateLesson(
  paragraphs: string[],
  ctx: { documentTitle: string; part: number; parts: number; profile: Profile },
  attempts = 3,
): Promise<GeneratedLesson> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(ctx.profile) },
    { role: "user", content: userPrompt(paragraphs, ctx) },
  ];
  let best: Check | null = null;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const reply = await chat({ task: "lesson_generate", messages, json: true, temperature: 0.3, maxTokens: 6000 });
      const check = validateLesson(parseJsonReply(reply.text), paragraphs);
      if (!best || check.lesson.vocab.length + check.lesson.content.tfng.length > best.lesson.vocab.length + best.lesson.content.tfng.length) best = check;
      if (check.good && check.problems.length <= 2) return check.lesson;
      messages.push(
        { role: "assistant", content: reply.text },
        {
          role: "user",
          content: `Your JSON failed these automatic checks:\n- ${check.problems.slice(0, 12).join("\n- ")}\nReturn the COMPLETE corrected JSON object. Quotes and "match" values must be copied character-for-character from the text.`,
        },
      );
    } catch (e) {
      lastError = e;
      if (e instanceof z.ZodError) {
        messages.push({ role: "user", content: "Your reply did not follow the JSON shape. Return the complete JSON object exactly in the requested shape." });
      }
    }
  }
  if (best && best.lesson.vocab.length >= 3 && best.lesson.content.tfng.length + best.lesson.content.mcq.length >= 2) return best.lesson;
  throw lastError instanceof Error ? lastError : new Error(best ? `AI output failed validation: ${best.problems.slice(0, 3).join("; ")}` : "AI generation failed");
}

/* ---------- document overview (topics, level, summary) ---------- */
const AiMeta = z.object({
  title: str(200).optional().nullable(),
  author: str(200).optional().nullable(),
  level: z.string().trim().max(4).optional().nullable(),
  summary: str(2000).optional().nullable(),
  topics: z.array(str(100)).max(5).default([]),
  source: str(200).optional().nullable(),
});
export type AiMeta = z.infer<typeof AiMeta>;

export async function generateMeta(sample: string, existingTopics: string[], profile: Profile): Promise<AiMeta> {
  const lang = profile.explainIn === "vi" ? "Vietnamese" : "English";
  const reply = await chat({
    task: "lesson_generate",
    json: true,
    temperature: 0.2,
    maxTokens: 800,
    messages: [
      {
        role: "system",
        content: `You classify reading passages for an IELTS learner. Return ONE JSON object:
{"title": "best title for the article (null if obvious from the text is not possible)", "author": "author or null", "level": "B1|B2|C1|C2 estimated reading difficulty",
 "summary": "3-4 sentence overview in ${lang}", "topics": ["1-3 topic names"], "source": "publication/website/book if it can be identified, else null"}
For topics, PREFER these existing names when they fit: ${existingTopics.length ? existingTopics.map((t) => `"${t}"`).join(", ") : "(none yet)"}. Only invent a new short English topic name if none fits.`,
      },
      { role: "user", content: `<text>\n${sample}\n</text>` },
    ],
  });
  return AiMeta.parse(parseJsonReply(reply.text));
}
