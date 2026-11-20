/**
 * Turn a dictionary entry's HTML into vocabulary-card fields (IPA, part of speech, meaning, example).
 * Formats differ between dictionaries; handled:
 *   "thy·roid — /ˈθaɪrɔɪd/" header · "tính từ" · "1. (giải phẫu) tuyến giáp" · "‣ thyroid cartilage ↔ sụn tuyến giáp"
 *   "pro·ced·ure — [UK] /…/ [US] /…/" header · "CEFR: B2" · "■ danh từ" · later "■ …" / "≈ …" sections (synonyms, origin) are skipped
 *   "@hat /hæt/" header · "* danh từ" · "- cái mũ" · "=to wear a hat+ đội mũ"
 * Only the first part of speech is used, so the card stays short like an AI card.
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

const bare = (s: string) => s.toLowerCase().replace(/[·•@*]/g, "").trim();

export function parseDictEntry(html: string, headword: string) {
  const lines = toText(html)
    .replace(INVISIBLE, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const word = bare(headword);
  let ipa: string | null = null;
  let pos: string | null = null;
  let example: string | null = null;
  const senses: string[] = [];

  for (const line of lines) {
    ipa ??= IPA.exec(line)?.[0] ?? null;
    // header: the headword (maybe with syllable dots or "@"), a dash, [UK]/[US] and IPAs
    const b = bare(line);
    if (b.startsWith(word) && !b.slice(word.length).replace(/\[(uk|us|br|am)\]|\/[^/]*\//g, "").replace(/[—–\-;,\s]/g, "")) continue;
    if (/^cefr\b/i.test(line)) continue;
    if (IPA.test(line) && line.replace(IPA, "").replace(/[—–\-\s]/g, "") === "") continue;

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

  return { ipa, pos, meaningVi: senses.join("; ").slice(0, 400) || null, example: example?.slice(0, 400) ?? null };
}
