/** Assistant conversations, stored in the settings table as "chat:<id>" (single user, small volume). */
import { desc, eq, like } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";

const { settings } = schema;
export const ChatId = z.string().regex(/^[a-z0-9-]{8,40}$/);
export const ChatBody = z.object({
  title: z.string().trim().max(120),
  lessonId: z.number().int().positive().nullable(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(20000) })).max(200),
});
export type Chat = z.infer<typeof ChatBody> & { id: string; updatedAt: string };

export async function listChats(limit = 50) {
  const rows = await getDb().select().from(settings).where(like(settings.key, "chat:%")).orderBy(desc(settings.updatedAt)).limit(limit);
  return rows.map((r) => {
    const c = r.value as Chat;
    return { id: r.key.slice(5), title: c.title, lessonId: c.lessonId, updatedAt: r.updatedAt };
  });
}

export async function getChat(id: string): Promise<Chat | null> {
  const [r] = await getDb().select().from(settings).where(eq(settings.key, `chat:${id}`));
  return r ? { ...(r.value as Chat), id, updatedAt: r.updatedAt.toISOString() } : null;
}

export async function saveChat(id: string, body: z.infer<typeof ChatBody>) {
  const value = { ...body, id };
  await getDb()
    .insert(settings)
    .values({ key: `chat:${id}`, value })
    .onDuplicateKeyUpdate({ set: { value, updatedAt: new Date() } });
}

export async function deleteChat(id: string) {
  await getDb().delete(settings).where(eq(settings.key, `chat:${id}`));
}
