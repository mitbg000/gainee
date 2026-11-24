/**
 * Turn a dictionary entry's HTML into vocabulary-card fields (IPA, part of speech, meaning, example).
 * Formats differ between dictionaries; handled:
 *   "thy·roid — /ˈθaɪrɔɪd/" header · "tính từ" · "1. (giải phẫu) tuyến giáp" · "‣ thyroid cartilage ↔ sụn tuyến giáp"
 *   "pro·ced·ure — [UK] /…/ [US] /…/" header · "CEFR: B2" · "■ danh từ" · later "■ …" / "≈ …" sections (synonyms, origin) are skipped
 *   "@hat /hæt/" header · "* danh từ" · "- cái mũ" · "=to wear a hat+ đội mũ"
 * Only the first part of speech and a short meaning (shortMeaning) are kept, so the card stays easy to memorise.
 */
const POS: [RegExp, string][] = [
  [/danh từ|\bnoun\b/i, "n."],
  [/ngoại động từ|nội động từ|động từ|\bverb\b/i, "v."],
  [/tính từ|\badjective\b/i, "adj."],
  [/phó từ|trạng từ|\badverb\b/i, "adv."],
  [/giới từ|\bpreposition\b/i, "prep."],
  [/liên từ|\bconjunction\b/i, "conj."],
  [/đại từ|\bpronoun\b/i, "pron."],
  [/thán từ|\binterjection\b/i, "interj."],
];
const INVISIBLE = /[­​-‍⁠﻿]/g;
const IPA = /\/[^/\n]{1,60}\//;

function toText(html: string) {
  return html
    .replace(/<(br|\/p|\/div|\/li|\/h\d|hr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

const letters = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export function parseDictEntry(html: string, headword: string) {
  const lines = toText(html)
    .replace(INVISIBLE, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const word = letters(headword);
  let ipa: string | null = null;
  let pos: string | null = null;
  let example: string | null = null;
  const senses: string[] = [];

  for (const line of lines) {
    ipa ??= IPA.exec(line)?.[0] ?? null;
    // header: the headword (with syllable dots, "@", any dash), [UK]/[US] and IPAs – compared by letters only,
    // and any line with an IPA before the first part of speech or meaning
    const rest = letters(line.replace(/\[(uk|us|br|am)\]|\/[^/\n]*\//gi, ""));
    if (rest === word || rest === "" || (IPA.test(line) && !pos && !senses.length)) continue;
    if (/^cefr\b/i.test(line)) continue;

    const posText = line.replace(/^[*•■◆\s]+/, "");
    const p = posText.length < 30 ? POS.find(([re]) => re.test(posText))?.[1] : undefined;
    if (p) {
      if (senses.length) break; // next part of speech: the card keeps the first one only
      pos ??= p;
      continue;
    }
    // other sections ("≈ CÙNG CHỦ ĐỀ", "■ đồng nghĩa/liên quan", "■ nguồn gốc từ") end the meanings
    if (/^[■≈◆]/.test(line)) {
      if (senses.length) break;
      continue;
    }

    // example: "‣ english ↔ tiếng Việt" or "=english+ tiếng Việt"
    if (/^[‣▸►=]/.test(line) || line.includes("↔")) {
      const body = line.replace(/^[‣▸►=]\s*/, "");
      const m = /^(.+?)\s*(?:↔|\+)\s*(.+)$/.exec(body);
      example ??= m ? `${m[1]} – ${m[2]}` : body;
      continue;
    }

    const sense = line.replace(/^(\d+[.)]|[a-z][.)]|[-–*•])\s*/i, "").replace(/[;,\s]+$/, "");
    if (sense && senses.length < 3) senses.push(sense);
  }

  return { ipa, pos, meaningVi: shortMeaning(senses), example: example?.slice(0, 160) ?? null };
}

/**
 * A flashcard needs a short meaning, not the whole entry: the first sense without field labels like "(giải phẫu)",
 * at most two of its synonyms, plus the second sense only when both stay short.
 */
export function shortMeaning(senses: string[]): string | null {
  const clean = senses
    .map((s) =>
      s
        .replace(/\([^)]*\)/g, "")
        .split(/[,;]/)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(", "),
    )
    .filter(Boolean);
  if (!clean.length) return null;
  const two = clean.slice(0, 2).join("; ");
  return (clean.length > 1 && two.length <= 40 ? two : clean[0]).slice(0, 80);
}
