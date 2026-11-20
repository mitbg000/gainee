/**
 * Apply pending migrations. Bundled to dist/migrate.js.
 * Usage: node --env-file=.env dist/migrate.js
 */
import path from "node:path";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { getDb } from "./index";

async function main() {
  const db = getDb();
  const [rows] = (await db.$client.query("SELECT @@character_set_database AS cs, VERSION() AS v")) as unknown as [
    { cs: string; v: string }[],
  ];
  console.log(`[migrate] server ${rows[0].v}, database charset ${rows[0].cs}`);
  if (rows[0].cs !== "utf8mb4") {
    console.warn(
      "[migrate] WARNING: database charset is not utf8mb4 – Vietnamese text and IPA may break.\n" +
        "          Fix: ALTER DATABASE <name> CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
    );
  }
  const folder = process.env.MIGRATIONS_DIR || path.join(process.cwd(), "drizzle");
  await migrate(db, { migrationsFolder: folder });
  console.log("[migrate] database is up to date");
  await db.$client.end();
}

main().catch((e) => {
  console.error("[migrate] failed:", e);
  process.exit(1);
});
