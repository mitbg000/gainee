import { NextResponse, type NextRequest } from "next/server";
import { ImportError, parseImportForm } from "@/lib/documents/create";
import { wordCount } from "@/lib/text/clean";
import { toPlain } from "@/lib/text/rich";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Show how a text will be cleaned and split before anything is saved. */
export async function POST(req: NextRequest) {
  try {
    const p = await parseImportForm(await req.formData());
    return NextResponse.json({
      title: p.title,
      author: p.author,
      sourceType: p.sourceType,
      paragraphs: p.paragraphs.length,
      words: p.paragraphs.reduce((a, x) => a + wordCount(x), 0),
      sample: p.paragraphs.map(toPlain).filter(Boolean).slice(0, 4),
      lessons: p.lessons.map((ps) => ({ words: ps.reduce((a, x) => a + wordCount(x), 0), start: (ps.map(toPlain).find(Boolean) ?? "").slice(0, 120) })),
    });
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
