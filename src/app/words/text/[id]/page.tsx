import { redirect } from "next/navigation";

/** The words of a reading text open in the notebook. */
export default async function TextSetPage({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/words?src=text:${Number((await params).id) || 0}`);
}
