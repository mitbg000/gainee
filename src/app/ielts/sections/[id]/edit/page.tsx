import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import SectionEditor from "@/components/ielts/SectionEditor";
import { getDb, schema } from "@/db";
import { audioFiles, getSection, pageImages } from "@/lib/ielts/queries";
import { sectionLabel } from "@/lib/ielts/labels";

export const dynamic = "force-dynamic";

export default async function EditSectionPage({ params }: { params: Promise<{ id: string }> }) {
  const r = await getSection(Number((await params).id));
  if (!r) notFound();
  const { section: s, test } = r;
  const [imgs, files, tests] = await Promise.all([
    pageImages(test.bookId),
    audioFiles(test.bookId),
    getDb().select({ id: schema.ieltsTests.id }).from(schema.ieltsTests).where(eq(schema.ieltsTests.bookId, test.bookId)).orderBy(asc(schema.ieltsTests.number)),
  ]);
  // "approve & next": the following section of the book, in test order
  const order = ["listening", "reading", "writing"];
  const all = (
    await getDb()
      .select({ id: schema.ieltsSections.id, testId: schema.ieltsSections.testId, skill: schema.ieltsSections.skill, part: schema.ieltsSections.part })
      .from(schema.ieltsSections)
      .where(eq(schema.ieltsSections.testId, test.id))
  ).sort((a, b) => order.indexOf(a.skill) - order.indexOf(b.skill) || a.part - b.part);
  let next = all[all.findIndex((x) => x.id === s.id) + 1]?.id ?? null;
  if (!next) {
    const nt = tests[tests.findIndex((x) => x.id === test.id) + 1];
    if (nt) {
      const ns = await getDb().select({ id: schema.ieltsSections.id, skill: schema.ieltsSections.skill, part: schema.ieltsSections.part }).from(schema.ieltsSections).where(eq(schema.ieltsSections.testId, nt.id));
      next = ns.sort((a, b) => order.indexOf(a.skill) - order.indexOf(b.skill) || a.part - b.part)[0]?.id ?? null;
    }
  }
  return (
    <Shell wide>
      <SectionEditor
        key={s.id}
        next={next}
        data={{
          id: s.id,
          skill: s.skill,
          part: s.part,
          title: s.title,
          label: sectionLabel(test.book?.title ?? "", test.title, s.skill, s.part),
          bookId: test.bookId,
          content: s.content,
          answers: s.answers,
          transcript: s.transcript,
          audio: s.audio,
          pages: [s.pages[0], s.pages[1]],
          reviewed: s.reviewed,
          pageImages: imgs,
          audioFiles: files.filter((f) => f.received >= f.size).map((f) => ({ id: f.id, name: f.name })),
        }}
      />
    </Shell>
  );
}
