/** Best-effort extraction of IPA, part of speech and a short meaning from a dictionary entry's HTML (formats differ between dictionaries). */
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

export function parseDictEntry(html: string, headword: string) {
  const lines = toText(html).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const text = lines.join("\n");
  const ipa = /(\/[^/\n]{1,60}\/)/.exec(text)?.[1] ?? null;
  const pos = POS.find(([re]) => re.test(text))?.[1] ?? null;
  const meaning = lines
    .filter((l) => l.toLowerCase() !== headword.toLowerCase() && !(ipa && l === ipa) && !POS.some(([re]) => re.test(l) && l.length < 25))
    .slice(0, 3)
    .map((l) => l.replace(/^[*\-=•\s]+|[;,\s]+$/g, ""))
    .join("; ")
    .replace(/^[*\-=•\s]+/, "")
    .slice(0, 400);
  return { ipa, pos, meaningVi: meaning || null };
}
