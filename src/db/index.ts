import mysql from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "./schema";

type DB = MySql2Database<typeof schema> & { $client: mysql.Pool };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (mysql://user:pass@127.0.0.1:3306/readlearn)");
  const pool = mysql.createPool({
    uri: url,
    charset: "utf8mb4_unicode_ci", // full Unicode (Vietnamese, emoji, IPA)
    timezone: "Z", // convert JS Dates as UTC
    connectionLimit: Number(process.env.DATABASE_POOL_SIZE || 5),
    waitForConnections: true,
    enableKeepAlive: true,
  });
  // Make CURRENT_TIMESTAMP defaults UTC too, whatever time zone the MySQL server uses.
  const core = (pool as unknown as { pool: { on(ev: "connection", cb: (c: { query(sql: string): void }) => void): void } }).pool;
  core.on("connection", (conn) => conn.query("SET time_zone = '+00:00'"));
  return pool;
}

/** Lazily created so `next build` never needs a database connection. */
const g = globalThis as unknown as { __db?: DB };
export function getDb(): DB {
  if (!g.__db) g.__db = drizzle(createPool(), { schema, mode: "default" }) as DB;
  return g.__db;
}

export { schema };
