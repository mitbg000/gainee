/** Import pipeline: input → plain text → paragraphs → lessons → background generation job. */
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { myId } from "@/lib/owner";
import { enqueue } from "@/lib/jobs";
import { getProfile } from "@/lib/profile";
import { saveUpload } from "@/lib/storage";
import { cleanToParagraphs, wordCount } from "@/lib/text/clean";
import { detectKind, extractFile } from "@/lib/text/extract";
import { escapeMd, parseEditedText, toPlain } from "@/lib/text/rich";
import { splitLessons } from "@/lib/text/split";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export type ParsedInput = {
  sourceType: "paste" | "pdf" | "docx" | "txt";
  title: string;
  author: string | null;
  source: string | null;
  labelIds: number[];
  paragraphs: string[];
  lessons: string[][];
  file?: { bytes: Uint8Array; ext: string };
};

export class ImportError extends Error {}

function clip(s: FormDataEntryValue | null, max: number) {
  return typeof s === "string" ? s.trim().slice(0, max) : "";
}

export async function parseImportForm(form: FormData): Promise<ParsedInput> {
  const profile = await getProfile();
  const file = form.get("file");
  let pages: string[] = [];
  let richParts: string[][] | null = null;
  let sourceType: ParsedInput["sourceType"] = "paste";
  let metaTitle: string | undefined;
  let metaAuthor: string | undefined;
  let saved: ParsedInput["file"];

  if (file && typeof file !== "string" && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) throw new ImportError("file_too_large");
    const kind = detectKind(file.name, file.type);
    if (!kind) throw new ImportError("unsupported_file");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let ex;
    try {
      ex = await extractFile(bytes, kind);
    } catch {
      throw new ImportError("cannot_read_file");
    }
    pages = ex.pages;
    sourceType = kind;
    // ignore useless PDF titles such as "Microsoft Word - file.docx"
    metaTitle = ex.title && !/^microsoft word|\.docx?$|^untitled/i.test(ex.title) ? ex.title : undefined;
    metaAuthor = ex.author;
    saved = { bytes, ext: kind };
  } else {
    const text = clip(form.get("text"), 400_000);
    if (!text) throw new ImportError("empty");
    // text from the rich editor already has explicit paragraphs, formatting, images and "---" lesson breaks
    if (form.get("rich") === "1") richParts = parseEditedText(text);
    else pages = [text];
  }

  const paragraphs = richParts ? richParts.flat() : cleanToParagraphs(pages).map(escapeMd);
  const words = paragraphs.reduce((a, p) => a + wordCount(p), 0);
  if (words < 80) throw new ImportError(sourceType === "pdf" ? "no_text_in_pdf" : "too_short");

  const labelIds = (() => {
    try {
      const v = JSON.parse(clip(form.get("labelIds"), 2000) || "[]");
      return Array.isArray(v) ? v.filter((n) => Number.isInteger(n) && n > 0).slice(0, 30) : [];
    } catch {
      return [];
    }
  })();

  return {
    sourceType,
    title: clip(form.get("title"), 500) || metaTitle || "",
    author: clip(form.get("author"), 255) || metaAuthor || null,
    source: clip(form.get("source"), 1000) || null,
    labelIds,
    paragraphs,
    lessons: richParts && richParts.length > 1 ? richParts : splitLessons(paragraphs, profile.lessonWords),
    file: saved,
  };
}

export async function createDocument(input: ParsedInput): Promise<number> {
  const db = getDb();
  const uid = await myId();
  const filePath = input.file ? await saveUpload(input.file.bytes, "documents", input.file.ext) : null;
  const words = input.paragraphs.reduce((a, p) => a + wordCount(p), 0);
  const firstLine = input.paragraphs.map(toPlain).find((p) => wordCount(p) >= 3) ?? "Untitled";
  const title = input.title || (firstLine.length > 80 ? firstLine.slice(0, 77) + "…" : firstLine);

  const id = await db.transaction(async (tx) => {
    const [{ id }] = await tx
      .insert(schema.documents)
      .values({
        userId: uid,
        title,
        author: input.author,
        source: input.source,
        sourceType: input.sourceType,
        filePath,
        rawText: input.paragraphs.map(toPlain).filter(Boolean).join("\n\n"),
        wordCount: words,
        status: "processing",
        meta: { userTitle: !!input.title },
      })
      .$returningId();
    await tx.insert(schema.lessons).values(
      input.lessons.map((ps, i) => ({
        documentId: id,
        position: i + 1,
        title: `Part ${i + 1}`,
        paragraphs: ps,
        wordCount: ps.reduce((a, p) => a + wordCount(p), 0),
        status: "pending" as const,
      })),
    );
    if (input.labelIds.length) {
      const existing = new Set((await tx.select({ id: schema.labels.id }).from(schema.labels).where(eq(schema.labels.userId, uid))).map((l) => l.id));
      const ok = input.labelIds.filter((l) => existing.has(l));
      if (ok.length) await tx.insert(schema.documentLabels).values(ok.map((labelId) => ({ documentId: id, labelId })));
    }
    return id;
  });

  await enqueue("generate_document", { documentId: id }, { maxAttempts: 2 });
  return id;
}
