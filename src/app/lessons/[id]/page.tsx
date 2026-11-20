import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import LessonReader from "@/components/lesson/LessonReader";
import { getLessonData } from "@/lib/lessons/queries";

export const dynamic = "force-dynamic";

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const data = Number.isInteger(id) ? await getLessonData(id) : null;
  if (!data || data.lesson.status !== "ready") notFound();
  return (
    <Shell wide>
      <LessonReader data={JSON.parse(JSON.stringify(data))} />
    </Shell>
  );
}
