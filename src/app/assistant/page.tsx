import AssistantChat from "@/components/AssistantChat";
import Shell from "@/components/Shell";
import { sidebarTree } from "@/lib/documents/queries";

export const dynamic = "force-dynamic";

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ lesson?: string }> }) {
  const lesson = Number((await searchParams).lesson) || null;
  const docs = await sidebarTree().catch(() => []);
  return (
    <Shell full>
      {/* fills the viewport like a chat app; mobile subtracts the top bar and the bottom tab bar */}
      <div className="h-[calc(100dvh-9.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-hidden rounded-2xl border border-line bg-paper md:h-[calc(100dvh-4rem)]">
        <AssistantChat docs={docs} initialLessonId={lesson} />
      </div>
    </Shell>
  );
}
