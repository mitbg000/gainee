import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, parseBody } from "@/lib/api";
import { saveSource } from "@/lib/listen/queries";
import { cueWords, parseTimed, toSentences } from "@/lib/listen/segment";
import { CaptionError, fetchCaptions, punctuate, youtubeId, youtubeTitle } from "@/lib/listen/youtube";

export const runtime = "nodejs";
export const maxDuration = 300;

// a YouTube video: its captions, or a transcript the learner pasted when they could not be fetched
// (IELTS parts are cut by the worker: /api/listen/ielts)
const Input = z.object({ url: z.string().min(5).max(500), transcript: z.string().max(500_000).optional(), title: z.string().max(255).optional() });

export async function POST(req: Request) {
  const [data, err] = await parseBody(req, Input);
  if (err) return err;

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
  // a little air before and after: caption times are close, never exact (no audio here to find the pauses)
  const clips = toSentences(words).map((c) => ({ ...c, start: Math.max(0, Math.round((c.start - 0.2) * 100) / 100), end: Math.round((c.end + 0.3) * 100) / 100 }));
  const id = await saveSource({ kind: "youtube", youtubeId: vid, title: title.slice(0, 255), captions }, clips);
  return NextResponse.json({ id, n: clips.length }, { status: 201 });
}
