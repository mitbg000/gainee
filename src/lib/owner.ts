/**
 * Whose data a query reads and writes. Learning data (words, reviews, progress, writings…) belongs to one user;
 * a text (document) belongs to its owner and can be shown to every learner or to chosen groups.
 */
import { and, eq, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentUser } from "@/lib/users";

/** The logged-in user's id (in a worker job: whoever queued it); throws when there is none. */
export async function myId(): Promise<number> {
  const u = await currentUser();
  if (!u) throw new Error("unauthorized");
  return u.id;
}

const d = schema.documents;

/** Texts this user may read: their own, public ones, and those shared with one of their groups. */
export const docVisible = (uid: number) =>
  or(
    eq(d.userId, uid),
    eq(d.visibility, "public"),
    and(eq(d.visibility, "groups"), sql`exists (select 1 from document_groups dg join user_groups ug on ug.group_id = dg.group_id where dg.document_id = ${d.id} and ug.user_id = ${uid})`),
  );

/** The document a lesson belongs to, if this user may read it. */
export async function readableLesson(lessonId: number, uid: number) {
  const [r] = await getDb()
    .select({ documentId: d.id, ownerId: d.userId })
    .from(schema.lessons)
    .innerJoin(d, eq(d.id, schema.lessons.documentId))
    .where(and(eq(schema.lessons.id, lessonId), docVisible(uid)));
  return r ?? null;
}

/** May this user change the text itself (rename, edit, delete, rebuild)? Its owner and admins. */
export async function canEditDoc(documentId: number) {
  const u = await currentUser();
  if (!u) return false;
  const [r] = await getDb().select({ ownerId: d.userId }).from(d).where(eq(d.id, documentId));
  return !!r && (r.ownerId === u.id || u.role === "admin");
}

/**
 * The data of the one-user days had no owner: it goes to the first admin, once (at their login).
 * Lesson and listening progress kept on the shared rows is copied into that admin's own progress.
 */
export async function claimOrphans(adminId: number) {
  const db = getDb();
  const [done] = await db.select().from(schema.settings).where(eq(schema.settings.key, "data.owner"));
  if (done) return;
  const id = Number(adminId);
  const owned = ["labels", "documents", "words", "review_logs", "attempts", "reading_sessions", "writings", "assessments", "xp_events", "goals", "annotations", "ai_messages", "word_sets", "ielts_attempts", "jobs"];
  for (const t of owned) await db.execute(sql.raw(`UPDATE \`${t}\` SET user_id = ${id} WHERE user_id IS NULL`));
  for (const t of ["activity", "achievements"]) await db.execute(sql.raw(`UPDATE \`${t}\` SET user_id = ${id} WHERE user_id = 0`));
  await db.execute(
    sql.raw(`INSERT IGNORE INTO lesson_progress (user_id, lesson_id, completed_at, best_score, notes)
      SELECT ${id}, id, completed_at, best_score, notes FROM lessons WHERE completed_at IS NOT NULL OR best_score IS NOT NULL OR (notes IS NOT NULL AND notes <> '')`),
  );
  await db.execute(
    sql.raw(`INSERT IGNORE INTO listen_progress (user_id, item_id, round, seen_at, tries, clean, due, \`interval\`, lapses, misses)
      SELECT ${id}, id, round, seen_at, tries, clean, due, \`interval\`, lapses, misses FROM listen_items WHERE tries > 0 OR round > 0 OR due IS NOT NULL OR seen_at IS NOT NULL`),
  );
  await db.execute(sql.raw(`INSERT IGNORE INTO listen_positions (user_id, source_id, position) SELECT ${id}, id, position FROM listen_sources WHERE position > 0`));
  await db.execute(sql.raw(`INSERT IGNORE INTO settings (\`key\`, value) SELECT 'profile.${id}', value FROM settings WHERE \`key\` = 'profile'`));
  await db.execute(sql.raw(`UPDATE settings SET \`key\` = CONCAT('chat:${id}:', SUBSTRING(\`key\`, 6)) WHERE \`key\` LIKE 'chat:%' AND \`key\` NOT REGEXP '^chat:[0-9]+:'`));
  await db.insert(schema.settings).values({ key: "data.owner", value: id });
}
