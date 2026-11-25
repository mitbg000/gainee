import type { Skill } from "./types";

/** "Cam 21 · Test 1 · Reading 2" */
export const sectionLabel = (book: string, test: string, skill: Skill, part: number) =>
  `${book} · ${test} · ${skill === "listening" ? "Listening Part" : skill === "reading" ? "Reading Passage" : "Writing Task"} ${part}`;

/** Audio stretch of a section for the player. */
export const audioOf = (a: { fileId: number; start?: number | null; end?: number | null } | null) => (a ? { url: `/api/ielts/audio/${a.fileId}`, start: a.start ?? null, end: a.end ?? null } : null);
