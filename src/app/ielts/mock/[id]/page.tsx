import { notFound } from "next/navigation";
import MockTest from "@/components/ielts/MockTest";
import { getTest } from "@/lib/ielts/queries";
import { audioOf } from "@/lib/ielts/labels";

export const dynamic = "force-dynamic";

/** Full-screen mock test like the computer-delivered IELTS (no app chrome; answer keys are not sent to the browser). */
export default async function MockPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ skill?: string; part?: string }> }) {
  const test = await getTest(Number((await params).id));
  if (!test) notFound();
  const q = await searchParams;
  // ?part=<section id>: just that Listening part / Reading passage / Writing task
  const one = test.sections.find((s) => s.id === Number(q.part));
  const sp = one?.skill ?? q.skill;
  const skill = sp === "listening" || sp === "reading" || sp === "writing" ? sp : "full";
  const sections = test.sections.filter((s) => !one || s.id === one.id).map((s) => ({ id: s.id, skill: s.skill, part: s.part, content: { ...s.content, warnings: undefined }, audio: audioOf(s.audio) }));
  // a part whose audio is the whole test's file but has no start/end marks would play every part
  const wholeFile = one?.skill === "listening" && !!one.audio && one.audio.start == null && one.audio.end == null && test.sections.some((s) => s.id !== one.id && s.audio?.fileId === one.audio!.fileId);
  return <MockTest wholeFile={wholeFile} data={{ testId: test.id, title: test.title, book: test.book?.title ?? "", sections }} skill={skill} sectionId={one?.id} />;
}
