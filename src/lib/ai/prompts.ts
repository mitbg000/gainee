/** Prompts for the reader's quick-AI panel and practice feedback. */
import type { Profile } from "@/lib/profile";

export const ASK_ACTIONS = ["explain_word", "explain_sentence", "grammar", "translate", "paraphrase", "custom", "feedback", "vocab_card"] as const;
export type AskAction = (typeof ASK_ACTIONS)[number];

export function askMessages(
  action: AskAction,
  input: { selection: string; context?: string; question?: string; feedbackKind?: string; prompt?: string; source?: string },
  profile: Profile,
) {
  const lang = profile.explainIn === "vi" ? "Vietnamese" : "English";
  if (action === "vocab_card") {
    return [
      {
        role: "system" as const,
        content: `You create vocabulary cards for a Vietnamese IELTS learner (CEFR ${profile.level}). Reply with ONE JSON object only, no markdown, no comments.`,
      },
      {
        role: "user" as const,
        content: `Selection: "${input.selection}"${input.context ? `\nContext from the text:\n"""${input.context}"""` : ""}
Make a vocabulary card for the word or phrase AS USED HERE. JSON keys (all strings):
{"term":"dictionary form (lemma) of the selection","ipa":"British IPA with slashes, e.g. /ˈplætəʊ/","pos":"n. | v. | adj. | adv. | phr.v. | idiom | prep. | conj.","meaningVi":"short Vietnamese meaning as used here","definitionEn":"one short English definition","example":"one NEW example sentence","note":"1-2 useful collocations or a usage tip"}`,
      },
    ];
  }
  const system = `You are a concise, friendly IELTS tutor for a Vietnamese learner (CEFR ${profile.level}, target band ${profile.targetBand}).
Answer in ${lang} (keep English examples in English). Use short Markdown: **bold**, *italics*, bullet lists. No preamble, no closing remarks. Max ~180 words unless asked otherwise.`;
  const ctx = input.context ? `\nContext from the text:\n"""${input.context}"""` : "";
  const sel = `Selection: "${input.selection}"`;
  const tasks: Record<AskAction, string> = {
    explain_word: `${sel}${ctx}\nExplain this word/phrase AS USED HERE: meaning (Vietnamese), part of speech, IPA, register (formal/informal), 2–3 useful collocations, and one new example sentence. Mention a common mistake if relevant.`,
    explain_sentence: `${sel}${ctx}\nExplain what this sentence means in plain words, including any idioms or implied meaning. Then give a simpler English paraphrase.`,
    grammar: `${sel}${ctx}\nAnalyse the grammar/structure: break it into parts, name the structures (e.g. inversion, participle clause, cleft sentence), and show how to reuse the pattern in IELTS Writing or Speaking with 2 examples.`,
    translate: `${sel}${ctx}\nTranslate naturally into Vietnamese. Then note 1–3 words or phrases that are hard to translate literally and why.`,
    paraphrase: `${sel}${ctx}\nGive 2 IELTS-style paraphrases (one band 6.5, one band 8) and point out the synonym/structure changes you made.`,
    custom: `${sel}${ctx}\nQuestion: ${input.question ?? ""}`,
    vocab_card: "", // handled above
    feedback: `Task type: ${input.feedbackKind ?? "writing"}\nPrompt/source: """${input.prompt ?? input.source ?? ""}"""\nLearner's answer: """${input.selection}"""
Give feedback as an IELTS examiner: estimated band (for paraphrase: meaning kept? natural?), 2–4 strengths/problems, corrected version of the weakest sentences, and 3 better word choices. Be encouraging but honest.`,
  };
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: tasks[action] },
  ];
}
