/**
 * Lightweight rich text stored inside each paragraph string:
 *   **bold**  *italic*  ***both***  "# heading"  "![alt](url)" (image paragraph)  "---" (line: start a new lesson)
 * Highlights, notes, vocabulary and the AI all work on the *plain* text (markers stripped), so their offsets never change.
 */
export type Style = { start: number; end: number; kind: "b" | "i" };
export type RichPara = { kind: "p" | "h" | "img"; text: string; styles: Style[]; src?: string; alt?: string };

const IMG = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
const TOKEN = /\\([\\*#!])|\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*|\*\*(?=\S)(.+?)(?<=\S)\*\*|\*(?=\S)(.+?)(?<=\S)\*/;

function inline(s: string, out: { text: string; styles: Style[] }) {
  for (let m = TOKEN.exec(s); m; m = TOKEN.exec(s)) {
    out.text += s.slice(0, m.index);
    if (m[1] !== undefined) out.text += m[1];
    else {
      const start = out.text.length;
      inline(m[2] ?? m[3] ?? m[4], out);
      const end = out.text.length;
      if (m[2] !== undefined) out.styles.push({ start, end, kind: "b" }, { start, end, kind: "i" });
      else out.styles.push({ start, end, kind: m[3] !== undefined ? "b" : "i" });
    }
    s = s.slice(m.index + m[0].length);
  }
  out.text += s;
}

export function parseRich(md: string): RichPara {
  const s = md.trim();
  const img = IMG.exec(s);
  if (img) return { kind: "img", text: "", styles: [], alt: img[1], src: img[2] };
  const h = /^#{1,3}\s+(.*)$/.exec(s);
  const out = { text: "", styles: [] as Style[] };
  inline(h ? h[1] : s, out);
  return { kind: h ? "h" : "p", ...out };
}

/** Plain text of a paragraph (what readers select, what the AI sees). Images give "". */
export const toPlain = (md: string) => parseRich(md).text;

/** Make arbitrary text safe to store as a paragraph (PDF/DOCX text may contain "*" or start with "#"). */
export const escapeMd = (s: string) => s.replace(/\\/g, "\\\\").replace(/\*/g, "\\*").replace(/^(#|!)/, "\\$1");

/**
 * Editor text → lessons → paragraphs. A blank line separates paragraphs; a line of "---" starts a new lesson.
 * Inline data: images are dropped (they must be uploaded first).
 */
export function parseEditedText(text: string, maxParts = 20): string[][] {
  return text
    .split(/^\s*-{3,}\s*$/m)
    .map((part) =>
      part
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\s+/g, " ").trim())
        .filter((p) => p && !/^!\[[^\]]*\]\(data:/.test(p)),
    )
    .filter((ps) => ps.length > 0)
    .slice(0, maxParts);
}
