/**
 * Text of one PDF page from pdf.js text items. Audioscripts print speaker names in a left column
 * ("WOMAN:") next to the words; plain reading order lists all names first and the lines after.
 * Each name is put back in front of the text on the same line, so the dialogue reads "WOMAN: Hello…".
 * Item positions must be as shown on the page (see shownAt).
 */
export type TextItem = { str: string; x: number; y: number; hasEOL?: boolean };

/** Position on the page as shown (x right, y down), also for rotated pages: viewport matrix × item origin. */
export function shownAt(vp: number[], t: number[]): { x: number; y: number } {
  return { x: vp[0] * t[4] + vp[2] * t[5] + vp[4], y: vp[1] * t[4] + vp[3] * t[5] + vp[5] };
}

const LABEL = /^\s*[A-Z][A-Z.'’ -]{0,24}:\s*$/;

export function pageText(items: TextItem[]): string {
  const labels = items.map((it) => LABEL.test(it.str));
  const before = new Map<number, string>(); // item index → speaker name to print before it
  const moved = new Set<number>();
  items.forEach((it, i) => {
    if (!labels[i]) return;
    const j = items.findIndex((o, k) => !labels[k] && o.str.trim() && Math.abs(o.y - it.y) < 3 && o.x > it.x && !before.has(k));
    if (j >= 0) {
      before.set(j, it.str.trim());
      moved.add(i);
    }
  });
  let out = "";
  items.forEach((it, i) => {
    if (moved.has(i)) return;
    const name = before.get(i);
    if (name) out += `${out && !out.endsWith("\n") ? "\n" : ""}${name} `;
    out += it.str + (it.hasEOL ? "\n" : " ");
  });
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
