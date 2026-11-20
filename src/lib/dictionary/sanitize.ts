import sanitizeHtml from "sanitize-html";

/**
 * Clean dictionary HTML once, at import time.
 * - keeps simple formatting only (no scripts, styles, images, inline colours → readable in dark mode)
 * - turns StarDict cross-references (bword://word) into in-app lookups: <a data-word="word">
 */
export function sanitizeEntry(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "b", "strong", "i", "em", "u", "br", "p", "div", "span", "ul", "ol", "li",
      "sup", "sub", "small", "blockquote", "a", "table", "thead", "tbody", "tr", "td", "th", "hr",
      "h1", "h2", "h3", "h4", "h5", "h6",
    ],
    allowedAttributes: { a: ["data-word"], "*": ["class"] },
    allowedClasses: { "*": [/^[a-z0-9_-]{1,40}$/i] },
    transformTags: {
      font: "span",
      a: (_tagName, attribs): sanitizeHtml.Tag => {
        const m = (attribs.href || "").match(/^(?:bword|entry):\/\/(.+)$/i);
        if (!m) return { tagName: "span", attribs: {} };
        let word = m[1];
        try {
          word = decodeURIComponent(word);
        } catch {
          /* keep raw */
        }
        return { tagName: "a", attribs: { "data-word": word.slice(0, 100) } };
      },
    },
    exclusiveFilter: (frame) => frame.tag === "a" && !frame.attribs["data-word"] && !frame.text.trim(),
  });
}

export function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!).replace(/\n/g, "<br>");
}
