/** Normalize a word or phrase for dictionary lookup (shared by importer and lookup). */
export function lookupKey(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .trim()
    .replace(/^[\s"'([{.,;:!?«»]+|[\s"')\]}.,;:!?«»]+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .slice(0, 191);
}

const IRREGULAR: Record<string, string> = {
  am: "be", is: "be", are: "be", was: "be", were: "be", been: "be", being: "be",
  has: "have", had: "have", having: "have", does: "do", did: "do", done: "do",
  went: "go", gone: "go", made: "make", took: "take", taken: "take", came: "come",
  saw: "see", seen: "see", got: "get", gotten: "get", gave: "give", given: "give",
  found: "find", thought: "think", told: "tell", became: "become", left: "leave",
  felt: "feel", brought: "bring", began: "begin", begun: "begin", kept: "keep",
  held: "hold", wrote: "write", written: "write", stood: "stand", heard: "hear",
  meant: "mean", met: "meet", ran: "run", paid: "pay", sat: "sit", spoke: "speak",
  spoken: "speak", led: "lead", grew: "grow", grown: "grow", lost: "lose", fell: "fall",
  fallen: "fall", sent: "send", built: "build", understood: "understand", drew: "draw",
  drawn: "draw", broke: "break", broken: "break", spent: "spend", rose: "rise", risen: "rise",
  drove: "drive", driven: "drive", bought: "buy", wore: "wear", worn: "wear", chose: "choose",
  chosen: "choose", sought: "seek", taught: "teach", caught: "catch", fought: "fight",
  children: "child", men: "man", women: "woman", people: "person", feet: "foot",
  teeth: "tooth", mice: "mouse", better: "good", best: "good", worse: "bad", worst: "bad",
};

/**
 * Cheap English lemma candidates used when the exact form and the .syn aliases miss,
 * e.g. "studies" → "study", "stopped" → "stop", "larger" → "large".
 */
export function lemmaCandidates(word: string): string[] {
  const w = lookupKey(word);
  const out = new Set<string>();
  if (IRREGULAR[w]) out.add(IRREGULAR[w]);
  if (!/^[a-z][a-z'-]*$/.test(w) || w.length < 3) return [...out];

  const add = (s: string) => s.length >= 2 && s !== w && out.add(s);
  const undouble = (s: string) => (/([bcdfgklmnprstvz])\1$/.test(s) ? s.slice(0, -1) : null);

  if (w.endsWith("'s")) add(w.slice(0, -2));
  if (w.endsWith("ies")) add(w.slice(0, -3) + "y");
  if (w.endsWith("es")) add(w.slice(0, -2));
  if (w.endsWith("s") && !w.endsWith("ss")) add(w.slice(0, -1));
  if (w.endsWith("ied")) add(w.slice(0, -3) + "y");
  if (w.endsWith("ed")) {
    const stem = w.slice(0, -2);
    add(stem);
    add(stem + "e");
    const u = undouble(stem);
    if (u) add(u);
  }
  if (w.endsWith("ing")) {
    const stem = w.slice(0, -3);
    add(stem);
    add(stem + "e");
    const u = undouble(stem);
    if (u) add(u);
    if (stem.endsWith("y")) add(stem.slice(0, -1) + "ie"); // lying → lie
  }
  for (const suf of ["er", "est"]) {
    if (!w.endsWith(suf)) continue;
    const stem = w.slice(0, -suf.length);
    if (stem.endsWith("i")) add(stem.slice(0, -1) + "y");
    add(stem);
    add(stem + "e");
    const u = undouble(stem);
    if (u) add(u);
  }
  if (w.endsWith("ly")) {
    const stem = w.slice(0, -2);
    add(stem);
    if (stem.endsWith("i")) add(stem.slice(0, -1) + "y");
  }
  return [...out];
}
