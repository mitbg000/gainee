import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import Shell from "@/components/Shell";
import PracticeSection from "@/components/ielts/PracticeSection";
import { getSection } from "@/lib/ielts/queries";
import { audioOf, sectionLabel } from "@/lib/ielts/labels";
import { cutJobs } from "@/lib/listen/jobs";
import { isEditor } from "@/lib/users";

export const dynamic = "force-dynamic";

/** Practice one Listening part / Reading passage, or one question group of it (?g=index). */
export default async function PracticePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ g?: string }> }) {
  const r = await getSection(Number((await params).id));
  if (!r || r.section.skill === "writing") notFound();
  const { section: s, test } = r;
  const g = Number((await searchParams).g);
  const canCut = await isEditor();
  // learners see the part in the bank only once an editor checked it
  const [bank] = await getDb().select({ id: schema.listenSources.id }).from(schema.listenSources).where(canCut ? eq(schema.listenSources.sectionId, s.id) : and(eq(schema.listenSources.sectionId, s.id), eq(schema.listenSources.reviewed, true)));
  const job = canCut ? (await cutJobs()).find((j) => j.sectionIds.includes(s.id)) : undefined;
  const only = Number.isInteger(g) && g >= 0 && g < s.content.groups.length ? g : undefined;
  return (
    <Shell wide>
      <PracticeSection
        only={only}
        data={{ id: s.id, testId: test.id, skill: s.skill, part: s.part, label: sectionLabel(test.book?.title ?? "", test.title, s.skill, s.part), content: s.content, answers: s.answers, transcript: s.transcript, audio: audioOf(s.audio), listenSourceId: bank?.id ?? null, listenJob: job ? { id: job.id, status: job.status, progress: job.progress } : null, canCut }}
      />
    </Shell>
  );
}
