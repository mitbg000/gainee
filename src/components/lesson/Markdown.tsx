/** Tiny, safe Markdown renderer for AI answers (HTML is escaped first). */
function inline(s: string) {
  return s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
}

export function renderMarkdown(md: string): string {
  const escaped = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = escaped.split(/\r?\n/);
  const out: string[] = [];
  let list: "ul" | "ol" | "table" | null = null;
  const close = () => {
    if (list) out.push(list === "table" ? "</tbody></table>" : `</${list}>`);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*\|.*\|\s*$/.test(line)) {
      // Markdown table row; the |---| separator line is skipped
      if (/^[\s|:-]+$/.test(line)) continue;
      const cells = line.trim().slice(1, -1).split("|").map((c) => `<td>${inline(c.trim())}</td>`).join("");
      if (list !== "table") {
        close();
        out.push("<table><tbody>");
        list = "table";
      }
      out.push(`<tr>${cells}</tr>`);
      continue;
    }
    // pictures only from our own image store (AI-made Task 1 diagrams)
    const img = line.match(/^!\[([^\]]*)\]\((\/api\/images\/[\w./-]+)\)$/);
    if (img && !img[2].includes("..")) {
      close();
      out.push(`<p><img src="${img[2]}" alt="${img[1].replace(/"/g, "&quot;")}" loading="lazy" style="max-width:100%;border-radius:12px"></p>`);
      continue;
    }
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (ul || ol) {
      const kind = ul ? "ul" : "ol";
      if (list !== kind) {
        close();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
    } else {
      close();
      if (h) out.push(`<p><strong>${inline(h[1])}</strong></p>`);
      else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
    }
  }
  close();
  return out.join("");
}

export default function Markdown({ text, className = "" }: { text: string; className?: string }) {
  return <div className={`ai-md ${className}`} dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
}
