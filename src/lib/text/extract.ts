/** Turn an uploaded file into plain text (one string per page for PDFs). */
import mammoth from "mammoth";
import { extractText, getDocumentProxy, getMeta } from "unpdf";

export type Extracted = { pages: string[]; title?: string; author?: string };
export const SUPPORTED = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain" } as const;
export type FileKind = keyof typeof SUPPORTED;

export function detectKind(filename: string, mime: string): FileKind | null {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf" || mime === SUPPORTED.pdf) return "pdf";
  if (ext === "docx" || mime === SUPPORTED.docx) return "docx";
  if (ext === "txt" || ext === "md" || mime.startsWith("text/")) return "txt";
  return null;
}

export async function extractFile(buf: Uint8Array, kind: FileKind): Promise<Extracted> {
  if (kind === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: false });
    let title: string | undefined;
    let author: string | undefined;
    try {
      const meta = await getMeta(pdf);
      const info = meta.info as { Title?: string; Author?: string };
      title = info.Title?.trim() || undefined;
      author = info.Author?.trim() || undefined;
    } catch {
      /* metadata is optional */
    }
    return { pages: text as string[], title, author };
  }
  if (kind === "docx") {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
    return { pages: [value] };
  }
  return { pages: [new TextDecoder("utf-8").decode(buf)] };
}
