import { getTranslations } from "next-intl/server";
import AssistantChat from "@/components/AssistantChat";
import Shell from "@/components/Shell";
import { sidebarTree } from "@/lib/documents/queries";

export const dynamic = "force-dynamic";

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ lesson?: string }> }) {
  const t = await getTranslations("assistant");
  const lesson = Number((await searchParams).lesson) || null;
  const docs = await sidebarTree().catch(() => []);
  return (
    <Shell>
      <h1 className="font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("intro")}</p>
      <div className="mt-5">
        <AssistantChat docs={docs} initialLessonId={lesson} />
      </div>
    </Shell>
  );
}
