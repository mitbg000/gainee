import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { bad, parseBody } from "@/lib/api";
import { saveSource } from "@/lib/listen/queries";
import { align, cueWords, parseTimed, scriptWords, snap, toSentences } from "@/lib/listen/segment";
import { CaptionError, fetchCaptions, punctuate, youtubeId, youtubeTitle } from "@/lib/listen/youtube";

export const runtime = "nodejs";
export const maxDuration = 300;

const Word = z.object({ w: z.string().max(100), s: z.number().min(0), e: z.number().min(0) });
const Input = z.union([
  // a YouTube video: its captions, or a transcript the learner pasted when they could not be fetched
  z.object({ url: z.string().min(5).max(500), transcript: z.string().max(500_000).optional(), title: z.string().max(255).optional() }),
  // an IELTS Listening part: what Whisper heard in the browser (times in the file) and the quiet stretches
  z.object({ sectionId: z.number().int().positive(), heard: z.array(Word).max(20_000), quiet: z.array(z.tuple([z.number(), z.number()])).max(20_000) }),
]);

export async function POST(req: Request) {
  const [data, err] = await parseBody(req, Input);
  if (err) return err;

  if ("sectionId" in data) {
    const [sec] = await getDb().select().from(schema.ieltsSections).where(eq(schema.ieltsSections.id, data.sectionId));
    if (!sec || sec.skill !== "listening" || !sec.audio) return bad("not_found", 404);
    if (!sec.transcript?.trim()) return bad("no_transcript");
    if (!data.heard.length) return bad("nothing_heard");
    const [test] = await getDb().select({ title: schema.ieltsTests.title, bookId: schema.ieltsTests.bookId }).from(schema.ieltsTests).where(eq(schema.ieltsTests.id, sec.testId));
    const [book] = test ? await getDb().select({ title: schema.ieltsBooks.title }).from(schema.ieltsBooks).where(eq(schema.ieltsBooks.id, test.bookId)) : [];
    const clips = snap(toSentences(align(scriptWords(sec.transcript), data.heard)), data.quiet);
    const id = await saveSource({ kind: "ielts", sectionId: sec.id, title: [book?.title, test?.title, `Listening Part ${sec.part}`].filter(Boolean).join(" · ").slice(0, 255), captions: "script" }, clips);
    return NextResponse.json({ id, n: clips.length }, { status: 201 });
  }

  const vid = youtubeId(data.url);
  if (!vid) return bad("bad_url");
  const title = data.title?.trim() || (await youtubeTitle(vid)) || vid;
  let words;
  let captions: "manual" | "auto" | "pasted";
  if (data.transcript?.trim()) {
    const cues = parseTimed(data.transcript);
    if (!cues.length) return bad("bad_transcript");
    words = cueWords(cues);
    captions = "pasted";
  } else {
    try {
      const got = await fetchCaptions(vid);
      words = got.words;
      captions = got.kind;
    } catch (e) {
      return bad(e instanceof CaptionError ? e.message : "captions_blocked", 422);
    }
  }
  words = await punctuate(words);
  const clips = toSentences(words);
  const id = await saveSource({ kind: "youtube", youtubeId: vid, title: title.slice(0, 255), captions }, clips);
  return NextResponse.json({ id, n: clips.length }, { status: 201 });
}
