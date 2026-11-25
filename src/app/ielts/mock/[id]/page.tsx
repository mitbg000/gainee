import { notFound } from "next/navigation";
import MockTest from "@/components/ielts/MockTest";
import { getTest } from "@/lib/ielts/queries";
import { audioOf } from "@/lib/ielts/labels";

export const dynamic = "force-dynamic";

/** Full-screen mock test like the computer-delivered IELTS (no app chrome; answer keys are not sent to the browser). */
export default async function MockPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ skill?: string }> }) {
  const test = await getTest(Number((await params).id));
  if (!test) notFound();
  const sp = (await searchParams).skill;
  const skill = sp === "listening" || sp === "reading" || sp === "writing" ? sp : "full";
  const sections = test.sections.map((s) => ({ id: s.id, skill: s.skill, part: s.part, content: { ...s.content, warnings: undefined }, audio: audioOf(s.audio) }));
  return <MockTest data={{ testId: test.id, title: test.title, book: test.book?.title ?? "", sections }} skill={skill} />;
}
