import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const [row] = await getDb().select().from(schema.settings).where(eq(schema.settings.key, key));
  return row?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown) {
  await getDb()
    .insert(schema.settings)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value, updatedAt: new Date() } });
}
