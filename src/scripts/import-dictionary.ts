/**
 * Import a StarDict dictionary into MySQL so look-ups work offline, without AI.
 *
 * Usage (on the server, in the app folder):
 *   node --env-file=.env dist/import-dictionary.js <source> [--name tudien]
 *
 * <source> can be:
 *   - a .zip containing *.ifo, *.idx(.gz), *.dict(.dz), optional *.syn(.gz)   ← e.g. tudien-stardict-en-vi.zip
 *   - a folder with those files
 *   - an http(s) URL to such a .zip
 *
 * Re-running replaces the previous import of the same --name.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { unzipSync } from "fflate";
import type { PoolConnection } from "mysql2/promise";
import { getDb } from "@/db";
import { setSetting } from "@/lib/settings";
import { lookupKey } from "@/lib/dictionary/normalize";
import { escapeText, sanitizeEntry } from "@/lib/dictionary/sanitize";

type Files = Map<string, Uint8Array>;

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const WANTED = /\.(ifo|idx|idx\.gz|dict|dict\.dz|syn|syn\.gz)$/i;

async function loadFiles(source: string): Promise<Files> {
  const files: Files = new Map();
  let zipBytes: Uint8Array | null = null;

  if (/^https?:\/\//i.test(source)) {
    console.log(`Downloading ${source} …`);
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    zipBytes = new Uint8Array(await res.arrayBuffer());
  } else if (fs.statSync(source).isDirectory()) {
    for (const name of fs.readdirSync(source)) {
      if (WANTED.test(name)) files.set(name, fs.readFileSync(path.join(source, name)));
    }
    return files;
  } else {
    zipBytes = fs.readFileSync(source);
  }

  const entries = unzipSync(zipBytes, { filter: (f) => WANTED.test(f.name) });
  for (const [name, data] of Object.entries(entries)) files.set(path.basename(name), data);
  return files;
}

function pick(files: Files, ...exts: string[]): Uint8Array | undefined {
  for (const ext of exts) {
    for (const [name, data] of files) {
      if (name.toLowerCase().endsWith(ext)) return ext.endsWith(".gz") || ext.endsWith(".dz") ? zlib.gunzipSync(data) : data;
    }
  }
  return undefined;
}

function parseIfo(buf: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of Buffer.from(buf).toString("utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

type IdxEntry = { word: string; offset: number; size: number };

function parseIdx(buf: Uint8Array, offsetBits: number): IdxEntry[] {
  const b = Buffer.from(buf);
  const out: IdxEntry[] = [];
  let p = 0;
  while (p < b.length) {
    const end = b.indexOf(0, p);
    if (end < 0) break;
    const word = b.toString("utf8", p, end);
    p = end + 1;
    const offset = offsetBits === 64 ? Number(b.readBigUInt64BE(p)) : b.readUInt32BE(p);
    p += offsetBits === 64 ? 8 : 4;
    const size = b.readUInt32BE(p);
    p += 4;
    out.push({ word, offset, size });
  }
  return out;
}

function parseSyn(buf: Uint8Array): { word: string; index: number }[] {
  const b = Buffer.from(buf);
  const out: { word: string; index: number }[] = [];
  let p = 0;
  while (p < b.length) {
    const end = b.indexOf(0, p);
    if (end < 0) break;
    out.push({ word: b.toString("utf8", p, end), index: b.readUInt32BE(end + 1) });
    p = end + 5;
  }
  return out;
}

/** XDXF → simple HTML before sanitizing. */
function xdxfToHtml(x: string): string {
  return x
    .replace(/<k>(.*?)<\/k>/gs, "<strong>$1</strong><br>")
    .replace(/<tr>(.*?)<\/tr>/gs, '<span class="ipa">[$1]</span>')
    .replace(/<kref>(.*?)<\/kref>/gs, (_m, w) => `<a href="bword://${encodeURIComponent(w)}">${w}</a>`)
    .replace(/<ex>(.*?)<\/ex>/gs, "<i>$1</i>")
    .replace(/<\/?(dtrn|def|gr|co|abr|c)[^>]*>/g, "")
    .replace(/\n/g, "<br>");
}

function fieldToHtml(type: string, data: Buffer): string {
  const s = data.toString("utf8");
  switch (type) {
    case "h":
    case "g":
      return sanitizeEntry(s);
    case "x":
      return sanitizeEntry(xdxfToHtml(s));
    case "m":
    case "l":
    case "y":
      return escapeText(s);
    case "t":
      return `<span class="ipa">[${escapeText(s)}]</span>`;
    default:
      return ""; // binary types (images, sounds) are skipped
  }
}

/** Decode one article according to the StarDict data format. */
function articleHtml(data: Buffer, sameTypeSequence: string | undefined): string {
  const parts: string[] = [];
  let p = 0;
  if (sameTypeSequence) {
    const types = sameTypeSequence.split("");
    types.forEach((type, i) => {
      const last = i === types.length - 1;
      if (last) {
        parts.push(fieldToHtml(type, data.subarray(p)));
      } else if (type === type.toLowerCase()) {
        const end = data.indexOf(0, p);
        parts.push(fieldToHtml(type, data.subarray(p, end)));
        p = end + 1;
      } else {
        const size = data.readUInt32BE(p);
        parts.push(fieldToHtml(type, data.subarray(p + 4, p + 4 + size)));
        p += 4 + size;
      }
    });
  } else {
    while (p < data.length) {
      const type = String.fromCharCode(data[p++]);
      if (type === type.toLowerCase()) {
        let end = data.indexOf(0, p);
        if (end < 0) end = data.length;
        parts.push(fieldToHtml(type, data.subarray(p, end)));
        p = end + 1;
      } else {
        const size = data.readUInt32BE(p);
        parts.push(fieldToHtml(type, data.subarray(p + 4, p + 4 + size)));
        p += 4 + size;
      }
    }
  }
  return parts.filter(Boolean).join("<br>");
}

async function insertBatch(conn: PoolConnection, sql: string, rows: unknown[][]) {
  if (rows.length) await conn.query(sql, [rows]);
}

async function main() {
  const source = process.argv[2];
  if (!source || source.startsWith("--")) {
    console.error("Usage: node --env-file=.env dist/import-dictionary.js <zip|folder|url> [--name tudien]");
    process.exit(1);
  }
  const name = arg("name", "tudien").slice(0, 32);
  const t0 = Date.now();

  const files = await loadFiles(source);
  const ifoBuf = pick(files, ".ifo");
  const idxBuf = pick(files, ".idx", ".idx.gz");
  const dictBuf = pick(files, ".dict", ".dict.dz");
  if (!ifoBuf || !idxBuf || !dictBuf) {
    throw new Error(`Could not find .ifo / .idx / .dict(.dz) in ${source}. Found: ${[...files.keys()].join(", ") || "nothing"}`);
  }
  const ifo = parseIfo(ifoBuf);
  const idx = parseIdx(idxBuf, ifo.idxoffsetbits === "64" ? 64 : 32);
  const synBuf = pick(files, ".syn", ".syn.gz");
  const syn = synBuf ? parseSyn(synBuf) : [];
  const dict = Buffer.from(dictBuf);
  console.log(`"${ifo.bookname || name}" – ${idx.length} entries, ${syn.length} aliases (format: ${ifo.sametypesequence || "mixed"})`);

  const db = getDb();
  const conn = await db.$client.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM dict_entries WHERE dict = ?", [name]); // aliases cascade
    const [[{ next }]] = (await conn.query("SELECT COALESCE(MAX(id), 0) + 1 AS next FROM dict_entries")) as unknown as [
      { next: number }[],
    ];

    const ids: number[] = new Array(idx.length);
    let batch: unknown[][] = [];
    let id = Number(next);
    for (let i = 0; i < idx.length; i++) {
      const e = idx[i];
      const html = articleHtml(dict.subarray(e.offset, e.offset + e.size), ifo.sametypesequence);
      ids[i] = id;
      batch.push([id++, name, e.word.slice(0, 191), lookupKey(e.word), html]);
      if (batch.length === 500) {
        await insertBatch(conn, "INSERT INTO dict_entries (id, dict, headword, lookup_key, html) VALUES ?", batch);
        batch = [];
        if ((i + 1) % 10000 < 500) process.stdout.write(`\r  entries: ${i + 1}/${idx.length}`);
      }
    }
    await insertBatch(conn, "INSERT INTO dict_entries (id, dict, headword, lookup_key, html) VALUES ?", batch);
    process.stdout.write(`\r  entries: ${idx.length}/${idx.length}\n`);

    batch = [];
    let aliases = 0;
    for (const s of syn) {
      if (s.index >= ids.length) continue;
      batch.push([name, lookupKey(s.word), ids[s.index]]);
      if (batch.length === 2000) {
        await insertBatch(conn, "INSERT INTO dict_aliases (dict, lookup_key, entry_id) VALUES ?", batch);
        aliases += batch.length;
        batch = [];
      }
    }
    await insertBatch(conn, "INSERT INTO dict_aliases (dict, lookup_key, entry_id) VALUES ?", batch);
    aliases += batch.length;

    await conn.commit();
    await setSetting(`dictionary.${name}`, {
      name: ifo.bookname || name,
      version: ifo.version,
      date: ifo.date,
      entries: idx.length,
      aliases,
      importedAt: new Date().toISOString(),
    });
    console.log(`✅ Imported ${idx.length} entries and ${aliases} aliases in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
    await db.$client.end();
  }
}

main().catch((e) => {
  console.error("❌ Import failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
