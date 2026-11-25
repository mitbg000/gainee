/**
 * Gainee database schema (MySQL 5.7+/8.0 or MariaDB 10.4+, single user).
 *
 * Tables for later phases are defined up front so the structure stays stable.
 * Conventions:
 *  - JSON is stored through `jsonText` (works on both MySQL JSON and MariaDB LONGTEXT JSON).
 *  - No DEFAULT on TEXT/JSON columns (MySQL 5.7 does not allow it); set them in code.
 *  - All timestamps are UTC DATETIME(3).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  datetime,
  double,
  index,
  int,
  longtext,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  tinyint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/* ---------- helpers ---------- */
const jsonText = <T>(name: string) =>
  customType<{ data: T; driverData: string }>({
    dataType: () => "json",
    toDriver: (v) => JSON.stringify(v),
    fromDriver: (v) => (typeof v === "string" ? JSON.parse(v) : v) as T,
  })(name);

export type DocumentMeta = { summary?: string; suggestedTopics?: string[]; suggestedSource?: string | null; userTitle?: boolean; dismissed?: boolean };

const pk = () => int("id").autoincrement().primaryKey();
const ts = (name: string) => datetime(name, { mode: "date", fsp: 3 });
const createdAt = () => ts("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`);
const updatedAt = () =>
  ts("updated_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`).$onUpdate(() => new Date());

/* =====================================================================
 * Settings (key/value)
 * ===================================================================== */
export const settings = mysqlTable("settings", {
  key: varchar("key", { length: 191 }).primaryKey(),
  value: jsonText<unknown>("value").notNull(),
  updatedAt: updatedAt(),
});

/* =====================================================================
 * Labels: user-defined categories for texts and words
 *   kind "topic"  – e.g. Education › Teaching (can be nested)
 *   kind "source" – e.g. The New Yorker, BBC, Cambridge IELTS 18
 *   kind "custom" – anything else: "exam-must-know", "phrasal verbs", "Speaking P2"…
 * ===================================================================== */
export const LABEL_COLORS = ["gray", "red", "orange", "amber", "green", "teal", "blue", "indigo", "purple", "pink"] as const;

export const labels = mysqlTable(
  "labels",
  {
    id: pk(),
    kind: mysqlEnum("kind", ["topic", "source", "custom"]).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    emoji: varchar("emoji", { length: 16 }),
    color: mysqlEnum("color", LABEL_COLORS).notNull().default("gray"),
    parentId: int("parent_id"), // topics only; self-reference (enforced in code)
    description: varchar("description", { length: 500 }),
    position: int("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("labels_kind_name").on(t.kind, t.name), index("labels_parent").on(t.parentId)],
);

/* =====================================================================
 * Content: documents → lessons → lesson vocabulary
 * ===================================================================== */
export const documents = mysqlTable("documents", {
  id: pk(),
  title: varchar("title", { length: 500 }).notNull(),
  author: varchar("author", { length: 255 }),
  source: varchar("source", { length: 1000 }), // publication name or URL
  sourceType: mysqlEnum("source_type", ["paste", "pdf", "docx", "txt", "url"]).notNull(),
  filePath: varchar("file_path", { length: 500 }), // original file under UPLOAD_DIR
  rawText: longtext("raw_text").notNull(),
  wordCount: int("word_count").notNull().default(0),
  level: varchar("level", { length: 8 }), // estimated CEFR: B1..C2
  /** AI-generated overview: { summary, suggestedTopics[], suggestedSource } – suggestions are only applied when the user accepts them. */
  meta: jsonText<DocumentMeta>("meta"),
  status: mysqlEnum("status", ["draft", "processing", "ready", "error"]).notNull().default("draft"),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const lessons = mysqlTable(
  "lessons",
  {
    id: pk(),
    documentId: int("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    position: int("position").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    titleVi: varchar("title_vi", { length: 500 }),
    paragraphs: jsonText<string[]>("paragraphs").notNull(),
    wordCount: int("word_count").notNull().default(0),
    warmup: text("warmup"),
    summary: text("summary"),
    /** Exercises, sentence structures, paraphrase, speaking/writing prompts (validated with zod). */
    content: jsonText<Record<string, unknown>>("content"),
    status: mysqlEnum("status", ["pending", "generating", "ready", "error"]).notNull().default("pending"),
    error: text("error"),
    completedAt: ts("completed_at"),
    bestScore: int("best_score"), // 0..100
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("lessons_doc_pos").on(t.documentId, t.position)],
);

export const lessonVocab = mysqlTable(
  "lesson_vocab",
  {
    id: pk(),
    lessonId: int("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
    headword: varchar("headword", { length: 191 }).notNull(),
    match: varchar("match", { length: 191 }).notNull(), // form as it appears in the text
    ipa: varchar("ipa", { length: 191 }),
    pos: varchar("pos", { length: 32 }),
    meaningVi: text("meaning_vi"),
    definitionEn: text("definition_en"),
    example: text("example"),
    note: text("note"),
    context: text("context"), // original sentence from the text
    cefr: varchar("cefr", { length: 4 }),
  },
  (t) => [index("lesson_vocab_lesson").on(t.lessonId)],
);

/* =====================================================================
 * Vocabulary notebook + FSRS spaced repetition + images
 * ===================================================================== */
export const words = mysqlTable(
  "words",
  {
    id: pk(),
    term: varchar("term", { length: 191 }).notNull(),
    ipa: varchar("ipa", { length: 191 }),
    pos: varchar("pos", { length: 32 }),
    meaningVi: text("meaning_vi"),
    definitionEn: text("definition_en"),
    context: text("context"),
    example: text("example"),
    note: text("note"),
    mnemonic: text("mnemonic"), // personal memory hook
    lessonId: int("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    lessonVocabId: int("lesson_vocab_id").references(() => lessonVocab.id, { onDelete: "set null" }),
    // FSRS card state
    due: ts("due").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    stability: double("stability").notNull().default(0),
    difficulty: double("difficulty").notNull().default(0),
    elapsedDays: int("elapsed_days").notNull().default(0),
    scheduledDays: int("scheduled_days").notNull().default(0),
    reps: int("reps").notNull().default(0),
    lapses: int("lapses").notNull().default(0),
    state: tinyint("state").notNull().default(0), // 0 New, 1 Learning, 2 Review, 3 Relearning
    lastReview: ts("last_review"),
    suspended: boolean("suspended").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("words_due").on(t.due), index("words_term").on(t.term)],
);

/** Uploaded / pasted files (images for words, original documents, audio recordings). */
export const media = mysqlTable("media", {
  id: pk(),
  kind: mysqlEnum("kind", ["image", "audio", "document"]).notNull(),
  path: varchar("path", { length: 500 }).notNull(), // relative to UPLOAD_DIR
  mime: varchar("mime", { length: 100 }).notNull(),
  bytes: int("bytes").notNull(),
  width: int("width"),
  height: int("height"),
  source: mysqlEnum("source", ["paste", "upload", "url", "ai"]).notNull().default("upload"),
  sourceUrl: varchar("source_url", { length: 1000 }),
  createdAt: createdAt(),
});

export const wordMedia = mysqlTable(
  "word_media",
  {
    wordId: int("word_id").notNull().references(() => words.id, { onDelete: "cascade" }),
    mediaId: int("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
    position: int("position").notNull().default(0),
    caption: varchar("caption", { length: 500 }),
  },
  (t) => [primaryKey({ columns: [t.wordId, t.mediaId] })],
);

export const reviewLogs = mysqlTable(
  "review_logs",
  {
    id: pk(),
    wordId: int("word_id").notNull().references(() => words.id, { onDelete: "cascade" }),
    rating: tinyint("rating").notNull(), // 1 Again, 2 Hard, 3 Good, 4 Easy
    mode: mysqlEnum("mode", ["recognize", "recall", "cloze", "listen", "spell", "image", "sentence", "passage"]).notNull(), // sentence: wrote a sentence with it; passage: met it in a review passage
    stateBefore: tinyint("state_before").notNull(),
    durationMs: int("duration_ms"),
    createdAt: createdAt(),
  },
  (t) => [index("review_logs_created").on(t.createdAt)],
);

/* =====================================================================
 * Learning history – the raw data for progress tracking
 * ===================================================================== */
export const attempts = mysqlTable(
  "attempts",
  {
    id: pk(),
    lessonId: int("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
    score: int("score").notNull(),
    total: int("total").notNull(),
    durationSec: int("duration_sec"),
    createdAt: createdAt(),
  },
  (t) => [index("attempts_created").on(t.createdAt)],
);

/** One row per answered question → accuracy per question type over time. */
export const answerLogs = mysqlTable(
  "answer_logs",
  {
    id: pk(),
    attemptId: int("attempt_id").notNull().references(() => attempts.id, { onDelete: "cascade" }),
    qtype: mysqlEnum("qtype", ["tfng", "ynng", "mcq", "gap", "matching", "heading", "short"]).notNull(),
    correct: boolean("correct").notNull(),
    given: varchar("given", { length: 500 }),
    expected: varchar("expected", { length: 500 }),
  },
  (t) => [index("answer_logs_type").on(t.qtype)],
);

export const readingSessions = mysqlTable(
  "reading_sessions",
  {
    id: pk(),
    lessonId: int("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
    seconds: int("seconds").notNull(),
    words: int("words").notNull(),
    wpm: int("wpm").notNull(),
    lookups: int("lookups").notNull().default(0), // words looked up while reading
    createdAt: createdAt(),
  },
  (t) => [index("reading_sessions_created").on(t.createdAt)],
);

/** Writing & speaking with AI band scores per IELTS criterion. */
export const writings = mysqlTable("writings", {
  id: pk(),
  lessonId: int("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
  kind: mysqlEnum("kind", ["paraphrase", "speaking", "task1", "task2", "free", "translate", "sentence"]).notNull(),
  prompt: text("prompt"),
  body: longtext("body").notNull(),
  audioMediaId: int("audio_media_id").references(() => media.id, { onDelete: "set null" }),
  wordCount: int("word_count").notNull().default(0),
  bandOverall: double("band_overall"),
  band1: double("band_1"), // TR/TA  or Fluency & Coherence
  band2: double("band_2"), // CC     or Lexical Resource
  band3: double("band_3"), // LR     or Grammar
  band4: double("band_4"), // GRA    or Pronunciation
  feedback: jsonText<Record<string, unknown>>("feedback"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Periodic benchmark tests – the objective "before vs. after" measurement. */
export const assessments = mysqlTable(
  "assessments",
  {
    id: pk(),
    kind: mysqlEnum("kind", ["reading_test", "vocab_size", "writing_task2", "speaking", "word_practice"]).notNull(),
    score: double("score").notNull(),
    maxScore: double("max_score"),
    band: double("band"),
    detail: jsonText<Record<string, unknown>>("detail"),
    createdAt: createdAt(),
  },
  (t) => [index("assessments_kind").on(t.kind, t.createdAt)],
);

/* =====================================================================
 * Motivation: daily activity, XP, goals, achievements
 * ===================================================================== */
/** One row per local day – streaks, heat map, daily goal. */
export const activity = mysqlTable("activity", {
  day: date("day", { mode: "string" }).primaryKey(), // YYYY-MM-DD in the user's time zone
  minutes: int("minutes").notNull().default(0),
  xp: int("xp").notNull().default(0),
  reviews: int("reviews").notNull().default(0),
  lessonsDone: int("lessons_done").notNull().default(0),
  wordsAdded: int("words_added").notNull().default(0),
  goalMet: boolean("goal_met").notNull().default(false),
  freezeUsed: boolean("freeze_used").notNull().default(false), // streak freeze
  mood: tinyint("mood"), // optional 1..5 self-rating
  reflection: text("reflection"), // "What did I learn today?"
});

export const xpEvents = mysqlTable(
  "xp_events",
  {
    id: pk(),
    kind: varchar("kind", { length: 50 }).notNull(), // lesson_done, review, perfect_score, streak_bonus...
    amount: int("amount").notNull(),
    refType: varchar("ref_type", { length: 50 }),
    refId: int("ref_id"),
    createdAt: createdAt(),
  },
  (t) => [index("xp_events_created").on(t.createdAt)],
);

export const goals = mysqlTable("goals", {
  id: pk(),
  kind: mysqlEnum("kind", [
    "daily_minutes",
    "daily_reviews",
    "weekly_lessons",
    "weekly_words",
    "target_band",
    "exam_date",
  ]).notNull(),
  target: double("target").notNull(),
  dueDate: date("due_date", { mode: "string" }),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const achievements = mysqlTable("achievements", {
  code: varchar("code", { length: 64 }).primaryKey(), // e.g. streak_7, words_100, first_band_7
  progress: int("progress").notNull().default(0),
  unlockedAt: ts("unlocked_at"),
});

/* =====================================================================
 * AI providers & usage
 * ===================================================================== */
export const aiProviders = mysqlTable("ai_providers", {
  id: pk(),
  name: varchar("name", { length: 32 }).notNull(), // deepseek | openai | gemini | xai | custom
  label: varchar("label", { length: 100 }).notNull(),
  baseUrl: varchar("base_url", { length: 500 }).notNull(),
  apiKeyEnc: text("api_key_enc").notNull(), // AES-256-GCM
  defaultModel: varchar("default_model", { length: 100 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: createdAt(),
});

export const aiCalls = mysqlTable(
  "ai_calls",
  {
    id: pk(),
    providerId: int("provider_id").references(() => aiProviders.id, { onDelete: "set null" }),
    model: varchar("model", { length: 100 }).notNull(),
    task: varchar("task", { length: 50 }).notNull(), // lesson | explain | grade_writing | chat ...
    promptTokens: int("prompt_tokens"),
    completionTokens: int("completion_tokens"),
    costUsd: double("cost_usd"),
    ok: boolean("ok").notNull(),
    error: text("error"),
    durationMs: int("duration_ms"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_calls_created").on(t.createdAt)],
);

/* =====================================================================
 * Background job queue (processed by the worker)
 * ===================================================================== */
export const jobs = mysqlTable(
  "jobs",
  {
    id: pk(),
    type: varchar("type", { length: 50 }).notNull(),
    payload: jsonText<Record<string, unknown>>("payload").notNull(),
    status: mysqlEnum("status", ["queued", "running", "done", "failed"]).notNull().default("queued"),
    attempts: int("attempts").notNull().default(0),
    maxAttempts: int("max_attempts").notNull().default(3),
    progress: varchar("progress", { length: 255 }), // e.g. "Generating lesson 3/12"
    result: jsonText<unknown>("result"),
    error: text("error"),
    runAt: ts("run_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
    createdAt: createdAt(),
  },
  (t) => [index("jobs_pick").on(t.status, t.runAt)],
);

/* =====================================================================
 * Offline dictionary (imported from StarDict, e.g. redphx/tudien)
 * ===================================================================== */
export const dictEntries = mysqlTable(
  "dict_entries",
  {
    id: pk(),
    dict: varchar("dict", { length: 32 }).notNull(), // dictionary id, e.g. "tudien"
    headword: varchar("headword", { length: 191 }).notNull(),
    lookupKey: varchar("lookup_key", { length: 191 }).notNull(), // normalized lower-case headword
    html: longtext("html").notNull(), // sanitized at import time
  },
  (t) => [index("dict_entries_key").on(t.lookupKey), index("dict_entries_dict").on(t.dict)],
);

/** Alternative spellings / inflections that point to an entry (StarDict .syn file). */
export const dictAliases = mysqlTable(
  "dict_aliases",
  {
    id: pk(),
    dict: varchar("dict", { length: 32 }).notNull(),
    lookupKey: varchar("lookup_key", { length: 191 }).notNull(),
    entryId: int("entry_id").notNull().references(() => dictEntries.id, { onDelete: "cascade" }),
  },
  (t) => [index("dict_aliases_key").on(t.lookupKey), index("dict_aliases_dict").on(t.dict)],
);

/* =====================================================================
 * Reader: highlights & margin notes, quick AI questions
 * ===================================================================== */
/**
 * A highlight/comment anchored to a text range inside one lesson paragraph.
 * Anchoring follows the W3C TextQuoteSelector idea: offsets for speed, plus the quoted text
 * with a little context so the note can be re-attached if the paragraph text ever changes.
 */
export const annotations = mysqlTable(
  "annotations",
  {
    id: pk(),
    lessonId: int("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
    paragraph: int("paragraph").notNull(), // index in lessons.paragraphs
    startOffset: int("start_offset").notNull(), // character offsets in the paragraph's plain text
    endOffset: int("end_offset").notNull(),
    quote: varchar("quote", { length: 1000 }).notNull(),
    prefix: varchar("prefix", { length: 64 }),
    suffix: varchar("suffix", { length: 64 }),
    color: mysqlEnum("color", ["yellow", "green", "blue", "pink", "purple"]).notNull().default("yellow"),
    note: text("note"), // empty = highlight only
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("annotations_lesson").on(t.lessonId, t.paragraph)],
);

/** Questions asked to the AI from the reader (or the dictionary), kept as a searchable history. */
export const aiMessages = mysqlTable(
  "ai_messages",
  {
    id: pk(),
    lessonId: int("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    annotationId: int("annotation_id").references(() => annotations.id, { onDelete: "set null" }),
    action: mysqlEnum("action", ["explain_word", "explain_sentence", "grammar", "translate", "paraphrase", "custom", "feedback"]).notNull(),
    selection: text("selection"), // highlighted text
    context: text("context"), // surrounding sentence/paragraph sent to the AI
    question: text("question"), // free-form question (action = custom)
    answer: longtext("answer"),
    providerId: int("provider_id").references(() => aiProviders.id, { onDelete: "set null" }),
    model: varchar("model", { length: 100 }),
    pinned: boolean("pinned").notNull().default(false), // shown in the margin like a note
    createdAt: createdAt(),
  },
  (t) => [index("ai_messages_lesson").on(t.lessonId)],
);

/* =====================================================================
 * Label assignments (many-to-many)
 * ===================================================================== */
export const documentLabels = mysqlTable(
  "document_labels",
  {
    documentId: int("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    labelId: int("label_id").notNull().references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.labelId] }), index("document_labels_label").on(t.labelId)],
);

export const wordLabels = mysqlTable(
  "word_labels",
  {
    wordId: int("word_id").notNull().references(() => words.id, { onDelete: "cascade" }),
    labelId: int("label_id").notNull().references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.wordId, t.labelId] }), index("word_labels_label").on(t.labelId)],
);

/* =====================================================================
 * Study sets (Quizlet-style "học phần"): named, ordered groups of saved words.
 * A word can be in many sets; removing it from a set keeps the word.
 * ===================================================================== */
export const wordSets = mysqlTable("word_sets", {
  id: pk(),
  title: varchar("title", { length: 191 }).notNull(),
  description: varchar("description", { length: 1000 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const wordSetItems = mysqlTable(
  "word_set_items",
  {
    setId: int("set_id").notNull().references(() => wordSets.id, { onDelete: "cascade" }),
    wordId: int("word_id").notNull().references(() => words.id, { onDelete: "cascade" }),
    position: int("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.setId, t.wordId] }), index("word_set_items_word").on(t.wordId)],
);

/* =====================================================================
 * IELTS test books (uploaded Cambridge-style PDFs + audio)
 *   book → pages (image + text, OCR'd by AI when the PDF is a scan) → tests → sections (one Listening part,
 *   Reading passage or Writing task each). Question content and answer keys are JSON, edited on the review screen.
 * ===================================================================== */
export const ieltsBooks = mysqlTable("ielts_books", {
  id: pk(),
  title: varchar("title", { length: 191 }).notNull(),
  status: mysqlEnum("status", ["uploading", "parsing", "review", "failed"]).notNull().default("uploading"),
  pageCount: int("page_count").notNull().default(0),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const ieltsPages = mysqlTable(
  "ielts_pages",
  {
    id: pk(),
    bookId: int("book_id").notNull().references(() => ieltsBooks.id, { onDelete: "cascade" }),
    page: int("page").notNull(),
    text: longtext("text"),
    imagePath: varchar("image_path", { length: 255 }),
    ocr: boolean("ocr").notNull().default(false),
  },
  (t) => [uniqueIndex("ielts_pages_book_page").on(t.bookId, t.page)],
);

export const ieltsAudio = mysqlTable("ielts_audio", {
  id: pk(),
  bookId: int("book_id").notNull().references(() => ieltsBooks.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  path: varchar("path", { length: 255 }).notNull(),
  size: int("size").notNull(),
  received: int("received").notNull().default(0),
  /** whole-test recording: second where each part is announced, found by Whisper in the browser ({"1":22,"2":431,…}) */
  marks: jsonText<Record<string, number> | null>("marks"),
  createdAt: createdAt(),
});

export const ieltsTests = mysqlTable(
  "ielts_tests",
  {
    id: pk(),
    bookId: int("book_id").notNull().references(() => ieltsBooks.id, { onDelete: "cascade" }),
    number: int("number").notNull(),
    title: varchar("title", { length: 191 }).notNull(),
  },
  (t) => [index("ielts_tests_book").on(t.bookId, t.number)],
);

export const ieltsSections = mysqlTable(
  "ielts_sections",
  {
    id: pk(),
    testId: int("test_id").notNull().references(() => ieltsTests.id, { onDelete: "cascade" }),
    skill: mysqlEnum("skill", ["listening", "reading", "writing"]).notNull(),
    part: int("part").notNull(),
    title: varchar("title", { length: 255 }),
    content: jsonText<Record<string, unknown>>("content").notNull(),
    answers: jsonText<Record<string, string>>("answers").notNull(),
    transcript: longtext("transcript"),
    audio: jsonText<{ fileId: number; start?: number | null; end?: number | null } | null>("audio"),
    pages: jsonText<number[]>("pages").notNull(),
    reviewed: boolean("reviewed").notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [index("ielts_sections_test").on(t.testId, t.skill, t.part)],
);

/** One try: a mock test (whole test or one skill, timed like the computer exam) or practice of one section / question group. */
export const ieltsAttempts = mysqlTable(
  "ielts_attempts",
  {
    id: pk(),
    testId: int("test_id").notNull().references(() => ieltsTests.id, { onDelete: "cascade" }),
    sectionId: int("section_id").references(() => ieltsSections.id, { onDelete: "cascade" }),
    mode: mysqlEnum("mode", ["mock", "practice"]).notNull(),
    skill: mysqlEnum("skill", ["listening", "reading", "writing", "full"]).notNull(),
    answers: jsonText<Record<string, unknown>>("answers").notNull(),
    detail: jsonText<Record<string, unknown>>("detail").notNull(),
    score: int("score"),
    total: int("total"),
    band: double("band"),
    seconds: int("seconds").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("ielts_attempts_created").on(t.createdAt), index("ielts_attempts_section").on(t.sectionId)],
);
